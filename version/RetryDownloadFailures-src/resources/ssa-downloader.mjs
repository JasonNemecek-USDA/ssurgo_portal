import apiServiceDef from "/static/services/apiService.mjs";
import pLimit from "/static/JsLibrary/pLimit/p-limit-index.js"
var WSS_DOWNLOAD_URL
var SDA_URL
const UPLOAD_URL = "/uploadBlob";
const UNZIP_URL = "/uncompress";
let cancel_download = false;
let cancel_reason = null;
let controller = new AbortController();
let signal = controller.signal
let unfinishedAreasymbols = []
let downloadFolder
const cpuThreads = self?.navigator?.hardwareConcurrency ?? 8
let runTelemetry = null
let telemetryIntervalId = null
let requestedDownloadProfile = 'auto'
let activeDownloadProfile = 'balanced'
let activeProfileSettings = null
let downloadUrlRefreshCache = new Map()

const DOWNLOAD_PROFILE_SETTINGS = {
    turbo: {
        concurrencyScale: {pipeline: 1.2, upload: 1.15, localIo: 1.1},
        minConcurrency: {pipeline: 6, upload: 2, localIo: 4},
        startUploadRatio: 0.9,
        retryUploadRatio: 0.8,
        maxRefreshPasses: 2,
        backpressureScale: 1.25,
        uploadSuccessThreshold: 3,
        metadataChunkSize: 320,
        metadataChunkConcurrency: 4,
    },
    balanced: {
        concurrencyScale: {pipeline: 1, upload: 1, localIo: 1},
        minConcurrency: {pipeline: 4, upload: 1, localIo: 2},
        startUploadRatio: 0.75,
        retryUploadRatio: 0.75,
        maxRefreshPasses: 3,
        backpressureScale: 1,
        uploadSuccessThreshold: 4,
        metadataChunkSize: 250,
        metadataChunkConcurrency: 3,
    },
    constrained: {
        concurrencyScale: {pipeline: 0.58, upload: 0.55, localIo: 0.65},
        minConcurrency: {pipeline: 2, upload: 1, localIo: 2},
        startUploadRatio: 0.55,
        retryUploadRatio: 0.65,
        maxRefreshPasses: 4,
        backpressureScale: 0.8,
        uploadSuccessThreshold: 6,
        metadataChunkSize: 180,
        metadataChunkConcurrency: 2,
    }
}

const DOWNLOAD_STAGE_POLICIES = {
    turbo: {
        sdaQuery: {attempts: 3, timeoutMs: 70000, retryDelayMs: 500, maxRetryDelayMs: 5000},
        uploadForm: {
            attempts: 3,
            timeoutMs: 90000,
            retryDelayMs: 450,
            maxRetryDelayMs: 5000,
            perMbTimeoutMs: 1200,
            maxAdaptiveTimeoutMs: 210000,
        },
        unzipForm: {attempts: 2, timeoutMs: 150000, retryDelayMs: 400, maxRetryDelayMs: 3500},
    },
    balanced: {
        sdaQuery: {attempts: 4, timeoutMs: 90000, retryDelayMs: 1000, maxRetryDelayMs: 8000},
        uploadForm: {
            attempts: 4,
            timeoutMs: 120000,
            retryDelayMs: 600,
            maxRetryDelayMs: 7000,
            perMbTimeoutMs: 1800,
            maxAdaptiveTimeoutMs: 240000,
        },
        unzipForm: {attempts: 3, timeoutMs: 180000, retryDelayMs: 500, maxRetryDelayMs: 5000},
    },
    constrained: {
        sdaQuery: {attempts: 6, timeoutMs: 180000, retryDelayMs: 1300, maxRetryDelayMs: 14000},
        uploadForm: {
            attempts: 6,
            timeoutMs: 180000,
            retryDelayMs: 1100,
            maxRetryDelayMs: 12000,
            perMbTimeoutMs: 2600,
            maxAdaptiveTimeoutMs: 360000,
        },
        unzipForm: {attempts: 5, timeoutMs: 240000, retryDelayMs: 900, maxRetryDelayMs: 10000},
    },
}

function getConcurrencyTargets(threads){
    const normalizedThreads = Number.isFinite(threads) && threads > 0
        ? Math.floor(threads)
        : 8

    if(normalizedThreads <= 4){
        return {pipeline: 14, upload: 4, localIo: 6}
    }
    if(normalizedThreads <= 8){
        return {pipeline: 24, upload: 7, localIo: 11}
    }
    if(normalizedThreads <= 16){
        return {pipeline: 32, upload: 10, localIo: 15}
    }
    return {pipeline: 40, upload: 12, localIo: 18}
}

const apiService = new apiServiceDef();
const enableVerboseDownloadLogs = false

function normalizeDownloadProfile(profileName){
    const normalized = String(profileName ?? '').trim().toLowerCase()
    if(normalized === 'auto' || normalized === 'turbo' || normalized === 'balanced' || normalized === 'constrained'){
        return normalized
    }

    return 'auto'
}

function resolveAutoDownloadProfile(areaCount = 0){
    const connection = self?.navigator?.connection
    const effectiveType = String(connection?.effectiveType ?? '').toLowerCase()
    const rtt = Number(connection?.rtt)
    const downlink = Number(connection?.downlink)
    const saveData = Boolean(connection?.saveData)

    if(
        saveData
        || effectiveType.includes('2g')
        || (Number.isFinite(rtt) && rtt >= 250)
        || (Number.isFinite(downlink) && downlink > 0 && downlink <= 1.5)
    ){
        return 'constrained'
    }

    if(
        effectiveType === '4g'
        && Number.isFinite(downlink)
        && downlink >= 20
        && (!Number.isFinite(rtt) || rtt <= 90)
        && areaCount <= 1500
    ){
        return 'turbo'
    }

    return 'balanced'
}

function resolveRunDownloadProfile(profileName, areaCount = 0){
    const normalized = normalizeDownloadProfile(profileName)
    if(normalized === 'auto'){
        return resolveAutoDownloadProfile(areaCount)
    }

    return normalized
}

function getProfileSettings(profileName){
    return DOWNLOAD_PROFILE_SETTINGS[profileName] ?? DOWNLOAD_PROFILE_SETTINGS.balanced
}

function getProfiledConcurrencyTargets(threads, profileSettings){
    const settings = profileSettings ?? DOWNLOAD_PROFILE_SETTINGS.balanced
    const baseTargets = getConcurrencyTargets(threads)
    const concurrencyScale = settings.concurrencyScale ?? DOWNLOAD_PROFILE_SETTINGS.balanced.concurrencyScale
    const minimums = settings.minConcurrency ?? DOWNLOAD_PROFILE_SETTINGS.balanced.minConcurrency

    return {
        pipeline: Math.max(minimums.pipeline, Math.round(baseTargets.pipeline * concurrencyScale.pipeline)),
        upload: Math.max(minimums.upload, Math.round(baseTargets.upload * concurrencyScale.upload)),
        localIo: Math.max(minimums.localIo, Math.round(baseTargets.localIo * concurrencyScale.localIo)),
    }
}

function getStageRetryPolicy(stageName){
    const profilePolicies = DOWNLOAD_STAGE_POLICIES[activeDownloadProfile] ?? DOWNLOAD_STAGE_POLICIES.balanced
    const fallbackPolicies = DOWNLOAD_STAGE_POLICIES.balanced
    return profilePolicies[stageName] ?? fallbackPolicies[stageName] ?? {}
}

function debugLog(...args){
    if(enableVerboseDownloadLogs){
        console.log(...args)
    }
}

function normalizeLogLevel(level){
    const normalized = String(level ?? '').trim().toLowerCase()
    if(
        normalized === 'debug'
        || normalized === 'info'
        || normalized === 'warning'
        || normalized === 'error'
        || normalized === 'critical'
    ){
        return normalized
    }

    return 'info'
}

async function postLoggerMessage(level, message, context = null){
    const normalizedLevel = normalizeLogLevel(level)
    const payload = {
        level: normalizedLevel,
        message: String(message ?? ''),
        source: 'ssa-downloader',
    }

    if(context != null){
        payload.context = context
    }

    try{
        const postResponse = await fetch('/tlogger', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(payload),
        })

        if(postResponse.ok){
            return
        }
    }
    catch(_error){
    }

    const encodedMessage = encodeURIComponent(payload.message)
    fetch(`/tlogger/${normalizedLevel}:${encodedMessage}`).catch(() => {})
}

function clearDownloadTelemetryInterval(){
    if(telemetryIntervalId != null){
        clearInterval(telemetryIntervalId)
        telemetryIntervalId = null
    }
}

function initializeRunTelemetry(areaCount, destination, overwrite){
    runTelemetry = {
        startedAtMs: Date.now(),
        totalAreas: Number.isFinite(areaCount) ? areaCount : 0,
        destination: String(destination ?? ''),
        overwrite: Boolean(overwrite),
        requestedProfile: requestedDownloadProfile,
        activeProfile: activeDownloadProfile,
        retryQueued: 0,
        governorAdjustments: 0,
        backpressureActivations: 0,
        sampleSequence: 0,
    }
}

function noteRetryQueued(count = 1){
    if(!runTelemetry){
        return
    }

    const increment = Number.isFinite(count) ? Math.max(0, count) : 0
    runTelemetry.retryQueued += increment
}

function getQueueSnapshot(limit, uploadLimit, ioLimit){
    return {
        pipelineActive: Number(limit?.activeCount ?? 0),
        pipelinePending: Number(limit?.pendingCount ?? 0),
        uploadConcurrency: Number(uploadLimit?.concurrency ?? 0),
        uploadActive: Number(uploadLimit?.activeCount ?? 0),
        uploadPending: Number(uploadLimit?.pendingCount ?? 0),
        ioConcurrency: Number(ioLimit?.concurrency ?? 0),
        ioActive: Number(ioLimit?.activeCount ?? 0),
        ioPending: Number(ioLimit?.pendingCount ?? 0),
    }
}

async function fetchRuntimeTelemetrySnapshot(){
    try{
        const response = await fetch('/runtimeTelemetry', {method: 'GET'})
        if(!response.ok){
            return null
        }

        return await response.json()
    }
    catch(_error){
        return null
    }
}

async function emitRunTelemetry(stage, limit, uploadLimit, ioLimit){
    if(!runTelemetry){
        return
    }

    runTelemetry.sampleSequence += 1
    const elapsedMs = Math.max(0, Date.now() - runTelemetry.startedAtMs)
    const queue = getQueueSnapshot(limit, uploadLimit, ioLimit)
    const runtime = await fetchRuntimeTelemetrySnapshot()
    const telemetry = {
        timestampUtc: new Date().toISOString(),
        stage,
        sequence: runTelemetry.sampleSequence,
        elapsedMs,
        totalAreas: runTelemetry.totalAreas,
        requestedProfile: runTelemetry.requestedProfile,
        activeProfile: runTelemetry.activeProfile,
        retryQueued: runTelemetry.retryQueued,
        governorAdjustments: runTelemetry.governorAdjustments,
        backpressureActivations: runTelemetry.backpressureActivations,
        destination: runTelemetry.destination,
        overwrite: runTelemetry.overwrite,
        queue,
        runtime,
    }

    postMessage({name: 'download-telemetry', telemetry})

    const cpuPercent = runtime?.cpuPercent ?? 'na'
    const memoryPercent = runtime?.memoryPercent ?? 'na'
    const summary = (
        `downloadTelemetry stage=${stage}`
        + ` profile=${telemetry.activeProfile}`
        + ` elapsedMs=${elapsedMs}`
        + ` totalAreas=${telemetry.totalAreas}`
        + ` retryQueued=${telemetry.retryQueued}`
        + ` governorAdjustments=${telemetry.governorAdjustments}`
        + ` backpressure=${telemetry.backpressureActivations}`
        + ` pipeline=${queue.pipelineActive}/${queue.pipelinePending}`
        + ` upload=${queue.uploadActive}/${queue.uploadPending}`
        + ` io=${queue.ioActive}/${queue.ioPending}`
        + ` cpuPct=${cpuPercent}`
        + ` memPct=${memoryPercent}`
    )
    postLoggerMessage('info', summary).catch(() => {})
}

function sleep(ms){
    return new Promise((resolve) => setTimeout(resolve, ms))
}

function buildUserCancelledError(){
    const error = new Error("Download cancelled by user request.")
    error.name = "UserCancelError"
    error.code = "user_cancelled"
    return error
}

function isUserCancelledError(error){
    return (
        cancel_download
        || error?.name === "UserCancelError"
        || error?.code === "user_cancelled"
        || (error?.name === "AbortError" && Boolean(signal?.aborted))
    )
}

function postDownloadCancelled(reason = "user_cancelled", message = "Download cancelled by user request."){
    postMessage({
        name: "download-cancelled",
        code: reason,
        reason,
        stage: "worker",
        retryable: false,
        message,
    })
}

async function postSdaQueryWithRetry(queryText){
    const queryPolicy = getStageRetryPolicy('sdaQuery')
    const attempts = queryPolicy.attempts ?? 4
    const timeoutMs = queryPolicy.timeoutMs ?? 90000
    const retryDelayMs = queryPolicy.retryDelayMs ?? 1000
    const maxRetryDelayMs = queryPolicy.maxRetryDelayMs ?? 8000

    const getBackoffMs = (attemptNumber) => {
        const exponentialDelay = retryDelayMs * (2 ** (attemptNumber - 1))
        const jitter = Math.floor(Math.random() * 300)
        return Math.min(maxRetryDelayMs, exponentialDelay) + jitter
    }

    for(let attempt = 1; attempt <= attempts; attempt++){
        try{
            const timeoutSignal = AbortSignal.timeout(timeoutMs)
            const combinedSignal = AbortSignal.any([signal, timeoutSignal])
            const response = await fetch(SDA_URL, {
                method: 'POST',
                body: JSON.stringify({'format': 'JSON', 'query': queryText}),
                signal: combinedSignal,
            })

            if(!response.ok){
                const retryableStatus = (
                    response.status === 408
                    || response.status === 429
                    || (response.status >= 500 && response.status < 600)
                )

                if(retryableStatus && attempt < attempts){
                    await sleep(getBackoffMs(attempt))
                    continue
                }

                throw new Error(`HTTP error! status: ${response.status}`)
            }

            return response.json()
        }
        catch(error){
            if(signal?.aborted || cancel_download){
                throw error
            }

            const isAbortTimeout = error?.name === 'AbortError'
            const errorMessage = String(error?.message ?? '').toLowerCase()
            const isNetworkFailure = (
                error instanceof TypeError
                || errorMessage.includes('failed to fetch')
                || errorMessage.includes('networkerror')
                || errorMessage.includes('timed out')
            )

            if((isAbortTimeout || isNetworkFailure) && attempt < attempts){
                await sleep(getBackoffMs(attempt))
                continue
            }

            if(isAbortTimeout){
                throw new Error(
                    `SDA request timed out after ${Math.round(timeoutMs / 1000)} seconds.`
                )
            }

            throw error
        }
    }

    throw new Error('SDA request failed after retries.')
}

function buildArchivePath(destination, fileName){
    if(destination.endsWith('\\') || destination.endsWith('/')){
        return `${destination}${fileName}`
    }
    return `${destination}\\${fileName}`
}

function getJsonByteLength(value){
    const jsonValue = JSON.stringify(value)
    if(typeof TextEncoder !== 'undefined'){
        return new TextEncoder().encode(jsonValue).length
    }
    return jsonValue.length
}

function splitIntoFileCheckChunks(paths, maxJsonBytes = 80 * 1024){
    const chunks = []
    let currentChunk = []

    for(const folderPath of paths){
        if(currentChunk.length === 0){
            currentChunk.push(folderPath)
            continue
        }

        const candidateChunk = [...currentChunk, folderPath]
        if(getJsonByteLength(candidateChunk) <= maxJsonBytes){
            currentChunk.push(folderPath)
            continue
        }

        chunks.push(currentChunk)
        currentChunk = [folderPath]
    }

    if(currentChunk.length > 0){
        chunks.push(currentChunk)
    }

    return chunks
}

async function collectMissingPathsFromFileExists(paths){
    const missingSet = new Set()
    const chunks = splitIntoFileCheckChunks(paths)

    for(const chunk of chunks){
        const response = await fetch('/fileExists', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(chunk),
            signal
        })

        if(!response.ok){
            return null
        }

        const payload = await response.json()
        if(!payload || !Array.isArray(payload.failedfolders)){
            return null
        }

        for(const failedFolder of payload.failedfolders){
            missingSet.add(failedFolder)
        }
    }

    return missingSet
}

async function splitExistingArchives(downloadFiles, destination, overwrite){
    if(overwrite || downloadFiles.length === 0){
        return {existingFiles: [], missingFiles: downloadFiles}
    }

    const archivePaths = downloadFiles.map(file => buildArchivePath(destination, file.fileName))
    try{
        const missingSet = await collectMissingPathsFromFileExists(archivePaths)
        if(!missingSet){
            return {existingFiles: [], missingFiles: downloadFiles}
        }

        const existingFiles = []
        const missingFiles = []

        downloadFiles.forEach((file, index) => {
            const archivePath = archivePaths[index]
            if(missingSet.has(archivePath)){
                missingFiles.push(file)
            }else{
                existingFiles.push(file)
            }
        })

        return {existingFiles, missingFiles}
    }
    catch(error){
        if(error?.name === 'AbortError'){
            throw error
        }
        return {existingFiles: [], missingFiles: downloadFiles}
    }
}

async function markFilesRequiringOverwrite(downloadFiles, destination, overwrite){
    if(overwrite || downloadFiles.length === 0){
        return downloadFiles
    }

    const areaFolderPaths = downloadFiles.map(file => buildArchivePath(destination, file.areaSymbol))
    try{
        const missingSet = await collectMissingPathsFromFileExists(areaFolderPaths)
        if(!missingSet){
            return downloadFiles
        }

        return downloadFiles.map((file, index) => {
            const folderPath = areaFolderPaths[index]
            const areaExists = !missingSet.has(folderPath)
            return {
                ...file,
                forceOverwrite: areaExists
            }
        })
    }
    catch(error){
        if(error?.name === 'AbortError'){
            throw error
        }
        return downloadFiles
    }
}

async function validateDestinationBeforeDownload(destination){
    const normalizedDestination = String(destination ?? '').trim()
    if(!normalizedDestination){
        return {
            success: false,
            message: 'Download folder is empty. Select a destination folder.'
        }
    }

    if(/^[A-Za-z]:\/?$/.test(normalizedDestination)){
        return {
            success: false,
            message: 'The root of a drive is not a valid download target. Choose a writable subfolder.'
        }
    }

    try{
        const response = await fetch('/validateDownloadFolder', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({location: normalizedDestination}),
            signal,
        })

        if(!response.ok){
            return {
                success: false,
                message: `Unable to validate download folder (${response.status}).`
            }
        }

        const payload = await response.json()
        if(payload?.success){
            return {success: true}
        }

        return {
            success: false,
            message: payload?.message ?? 'Download folder validation failed.'
        }
    }
    catch(error){
        if(error?.name === 'AbortError'){
            throw error
        }

        return {
            success: false,
            message: `Unable to validate download folder: ${error?.message ?? error}`
        }
    }
}

onmessage = async (event) => {

    debugLog("Received message from the main thread:", event.data)

    const data = event.data;

    if(data.command === 'download'){
        cancel_download = false;
        cancel_reason = null;
        try{
            const dest = data.destination;
            const areaSymbols = Array.isArray(data.areaSymbols) ? data.areaSymbols : [];
            requestedDownloadProfile = normalizeDownloadProfile(data.downloadProfile)
            activeDownloadProfile = resolveRunDownloadProfile(requestedDownloadProfile, areaSymbols.length)
            activeProfileSettings = getProfileSettings(activeDownloadProfile)
            apiService.setRetryProfile(activeDownloadProfile)
            downloadUrlRefreshCache = new Map()

            postMessage({
                name: 'download-profile',
                requestedProfile: requestedDownloadProfile,
                activeProfile: activeDownloadProfile,
            })

            postLoggerMessage(
                'info',
                `download profile selected requested=${requestedDownloadProfile} active=${activeDownloadProfile}`
            ).catch(() => {})

            const destinationValidation = await validateDestinationBeforeDownload(dest)
            if(!destinationValidation.success){
                postMessage({
                    name: 'download-error',
                    code: 'destination_validation_failed',
                    stage: 'preflight',
                    retryable: false,
                    message: destinationValidation.message
                })
                postMessage({name: 'message-received', message: 'message received;'})
                return
            }

            downloadFolder = dest
            const overwrite = data.overwrite;
            await downloadSurveyAreas(areaSymbols, dest, overwrite);
            if(cancel_download){
                postDownloadCancelled(cancel_reason || 'user_cancelled')
            }
            else{
                postMessage({name: "download-complete"});
            }
        }
        catch(error){
            if(isUserCancelledError(error)){
                postDownloadCancelled(cancel_reason || 'user_cancelled')
            }
            else{
                const message = String(error?.message ?? error ?? 'Download worker failed unexpectedly.')
                postMessage({
                    name: 'download-error',
                    code: 'worker_unhandled_error',
                    stage: 'worker',
                    retryable: false,
                    message,
                })
            }
        }
            
    }
    else if(data.command === "return-urls"){
        WSS_DOWNLOAD_URL = data.urls.wssDownloadUrl;
        SDA_URL = data.urls.sdaPostRestUrl;
        postMessage({name: 'urls-set'});
    }
    else if(data.command === 'stop-download'){
        cancel_download = true;
        cancel_reason = 'user_cancelled'
        controller.abort()
        //Define a new abort controller and signal.
        controller = new AbortController()
        signal = controller.signal

        //If we have any unfinished downloads, delete the files to prevent uncomplete data from being used by the user. 
        if(unfinishedAreasymbols.length != 0){
            await fetch(
                "/SSURGOPortalUI", {
                method: 'POST',
                headers: {'Content-Type' : 'application/json'},
                body: JSON.stringify({
                    'request': 'deleteunfinisheddownloads',
                    'downloaddir': downloadFolder,
                    'soilsurveyareas': unfinishedAreasymbols,
                    'creationcutoff': 4 //Anything in unfinishedAreasymbols created within the past 4 hours will be deleted
                }
                )}
            )
            unfinishedAreasymbols = []
        }

        postDownloadCancelled(cancel_reason)
    }

    const result = "message received;";
    postMessage({name: 'message-received', message: result});

}

/**
 * This function retrieves the download URLs for the given area symbols. It first creates a temporary table with the area symbols, then queries the SDA to get the WKT for each area symbol. Finally, it queries the SASTATUSMAP to get the save/rest date for each area symbol and constructs the download URLs.
 * @param {[string]} areaSymbols - The area symbols to get the download URLs for.
 * @returns {Promise<[Object]>} - A promise that resolves to an array of objects containing the area symbol, area name, and file name for each area symbol.
 */
async function getDownloadUrls(areaSymbols, options = {}){
    const normalizedAreaSymbols = Array.from(
        new Set(
            (Array.isArray(areaSymbols) ? areaSymbols : [])
                .map((value) => String(value ?? '').trim())
                .filter((value) => value.length > 0)
        )
    )
    const preferCache = options.preferCache !== false

    if(normalizedAreaSymbols.length === 0){
        return []
    }

    const cachedUrlsBySymbol = new Map()
    const symbolsToLookup = []
    for(const areaSymbol of normalizedAreaSymbols){
        const cachedUrl = preferCache ? downloadUrlRefreshCache.get(areaSymbol) : null
        if(cachedUrl){
            cachedUrlsBySymbol.set(areaSymbol, cachedUrl)
        }
        else{
            symbolsToLookup.push(areaSymbol)
        }
    }

    if(symbolsToLookup.length === 0){
        return normalizedAreaSymbols
            .map((areaSymbol) => cachedUrlsBySymbol.get(areaSymbol))
            .filter(Boolean)
    }

    const queryStatusMapChunk = async (chunk) => {
        const sqlQuery = `SELECT AREASYMBOL, AREANAME, CONVERT(varchar(10), [SAVEREST], 126) AS SAVEREST FROM SASTATUSMAP WHERE AREASYMBOL IN (${chunk.map(s => `'${s}'`).join(',')}) ORDER BY AREASYMBOL;`;
        return postSdaQueryWithRetry(sqlQuery);
    }

    const fetchStatusMapChunk = async (chunk) => {
        try{
            return await queryStatusMapChunk(chunk)
        }
        catch(error){
            const errorText = String(error?.message ?? '').toLowerCase()
            const canSplit = chunk.length > 40
            if(canSplit && (errorText.includes('status: 400') || errorText.includes('status: 413'))){
                const midpoint = Math.ceil(chunk.length / 2)
                const leftResponse = await fetchStatusMapChunk(chunk.slice(0, midpoint))
                const rightResponse = await fetchStatusMapChunk(chunk.slice(midpoint))
                return {
                    Table: [
                        ...(Array.isArray(leftResponse?.Table) ? leftResponse.Table : []),
                        ...(Array.isArray(rightResponse?.Table) ? rightResponse.Table : [])
                    ]
                }
            }

            throw error
        }
    }

    const chunkSize = Math.max(
        80,
        Number(activeProfileSettings?.metadataChunkSize ?? DOWNLOAD_PROFILE_SETTINGS.balanced.metadataChunkSize)
    )
    const metadataChunkConcurrency = Math.max(
        1,
        Number(
            activeProfileSettings?.metadataChunkConcurrency
            ?? DOWNLOAD_PROFILE_SETTINGS.balanced.metadataChunkConcurrency
            ?? 2
        )
    )

    const symbolChunks = []
    for(let index = 0; index < symbolsToLookup.length; index += chunkSize){
        symbolChunks.push(symbolsToLookup.slice(index, index + chunkSize))
    }

    debugLog('Metadata URL lookup settings:', {
        chunkSize,
        metadataChunkConcurrency,
        chunkCount: symbolChunks.length,
    })

    const metadataLimit = pLimit({
        concurrency: metadataChunkConcurrency,
        rejectOnClear: true,
    })

    const chunkTasks = symbolChunks.map((areaSymbolChunk) => {
        return metadataLimit(async () => {
            const chunkResponse = await fetchStatusMapChunk(areaSymbolChunk)
            return Array.isArray(chunkResponse?.Table) ? chunkResponse.Table : []
        })
    })

    const sastatusmap_records = []
    const chunkResults = await Promise.all(chunkTasks)
    for(const records of chunkResults){
        if(records.length > 0){
            sastatusmap_records.push(...records)
        }
    }

    for(const rec of sastatusmap_records){
        const mappedRecord = {
            areaSymbol: rec[0],
            areaName: rec[1],
            fileName: `wss_SSA_${rec[0]}_[${rec[2]}].zip`
        }
        cachedUrlsBySymbol.set(mappedRecord.areaSymbol, mappedRecord)
        downloadUrlRefreshCache.set(mappedRecord.areaSymbol, mappedRecord)
    }

    return normalizedAreaSymbols
        .map((areaSymbol) => cachedUrlsBySymbol.get(areaSymbol))
        .filter(Boolean)
}
/**
 * This class represents a zip file for a soil survey area. It contains the area symbol, area name, file name, and blob data for the zip file. It also contains functions to read the zip file from WSS, save the zip file to the local machine, and unzip the file on the local machine. The reason for having this class is to keep all the information and functions related to the zip file in one place, which makes it easier to manage and maintain the code.
 */
class AreaZipFile{
    /**
     * Constructor for the AreaZipFile class. It takes in the area symbol, area name, file name, and blob data for the zip file. The blob data is initially set to null and will be populated when the readLargeFile function is called.
     * @param {string} areaSymbol 
     * @param {string} areaName 
     * @param {string} fileName 
     * @param {Blob} blob 
     */
    constructor(areaSymbol, areaName, fileName, blob){
        this.areaSymbol = areaSymbol,
        this.areaName = areaName
        this.fileName = fileName,
        this.blob = blob
        this.lastSaveError = null
        this.lastSaveRetryable = true
    }

    static isRetryableLocalSaveError(message){
        const text = String(message ?? '').toLowerCase()
        if(!text){
            return true
        }

        // Local filesystem permission/path errors are deterministic and should not be retried.
        return !(
            text.includes('permission denied') ||
            text.includes('access is denied') ||
            text.includes('no such file or directory') ||
            text.includes('cannot find the path') ||
            text.includes('the system cannot find the path') ||
            text.includes('invalid argument')
        )
    }

    static isMissingArchiveError(error){
        const text = String(error?.message ?? '').toLowerCase()
        return text.includes('status: 400') || text.includes('status: 404')
    }

    static buildNearbyArchiveNames(fileName, fallbackWindowDays = 14){
        const fileNamePattern = /^wss_SSA_(.+)_\[(\d{4}-\d{2}-\d{2})\]\.zip$/
        const fileMatch = fileName.match(fileNamePattern)
        if(!fileMatch){
            return []
        }

        const areaSymbol = fileMatch[1]
        const baseDate = new Date(`${fileMatch[2]}T00:00:00Z`)
        if(Number.isNaN(baseDate.getTime())){
            return []
        }

        const fallbackNames = []
        for(let offset = 1; offset <= fallbackWindowDays; offset++){
            const plusDate = new Date(baseDate)
            plusDate.setUTCDate(plusDate.getUTCDate() + offset)
            fallbackNames.push(
                `wss_SSA_${areaSymbol}_[${plusDate.toISOString().slice(0, 10)}].zip`
            )

            const minusDate = new Date(baseDate)
            minusDate.setUTCDate(minusDate.getUTCDate() - offset)
            fallbackNames.push(
                `wss_SSA_${areaSymbol}_[${minusDate.toISOString().slice(0, 10)}].zip`
            )
        }

        return fallbackNames
    }

    async _downloadBlobByFileName(candidateFileName){
        const candidateUrl = `${WSS_DOWNLOAD_URL}${candidateFileName}`
        this.blob = await apiService.getBlob(candidateUrl, signal, {policyKey: 'blobDownload'})
        this.fileName = candidateFileName
    }

    /**
     * Reads the zip file from WSS as a blob. This function is necessary because some of the zip files are too large to be read into memory all at once, so we need to use a stream reader to read the file in chunks.
     * @returns 
     */
    async readLargeFile() {
        const originalFileName = this.fileName
        const fallbackWindowDays = 14

        try{
            await this._downloadBlobByFileName(originalFileName)
            return
        }
        catch(error){
            if(error.name == "AbortError"){
                throw buildUserCancelledError()
            }

            if(!AreaZipFile.isMissingArchiveError(error)){
                throw error
            }

            const fallbackNames = AreaZipFile.buildNearbyArchiveNames(
                originalFileName,
                fallbackWindowDays
            )

            for(const fallbackName of fallbackNames){
                if(fallbackName == originalFileName){
                    continue
                }

                try{
                    await this._downloadBlobByFileName(fallbackName)
                    return
                }
                catch(fallbackError){
                    if(fallbackError.name == "AbortError"){
                        throw buildUserCancelledError()
                    }

                    if(!AreaZipFile.isMissingArchiveError(fallbackError)){
                        throw fallbackError
                    }
                }
            }

            throw new Error(
                `${error?.message ?? 'Archive download failed.'} `
                + `Tried WSS fallback date search (+/-${fallbackWindowDays} days) for ${this.areaSymbol}.`
            )
        }
    }
    /**
     * Saves the zipfile from WSS to the local machine by calling the local node server. The node server will save the file and return a success message, but it will not unzip the file. This is because we want to keep the full pipeline of download -> save -> unzip in one function, so that if the user cancels in the middle of the pipeline, we can stop the entire process and prevent incomplete data from being saved or unzipped on the users machine.
     * @param {*} destination 
     * @param {*} overwrite 
     * @returns 
     */
    async saveZipFile(destination, overwrite, reportFailure = true){
        this.lastSaveError = null
        this.lastSaveRetryable = true

        let params = [];
        params.push({name: 'file', value: this.blob, fileName: this.fileName});
        params.push({name: 'filename', value: this.fileName});
        params.push({name: 'location', value: destination});
        params.push({name: 'overwrite', value: overwrite ? '1' : '0'});

        const uploadPolicy = getStageRetryPolicy('uploadForm')
        const blobSizeMb = Math.max(1, Math.ceil((this.blob?.size ?? 0) / (1024 * 1024)))
        const baseUploadTimeoutMs = uploadPolicy.timeoutMs ?? 120000
        const uploadTimeoutPerMbMs = uploadPolicy.perMbTimeoutMs ?? 1800
        const maxAdaptiveTimeoutMs = uploadPolicy.maxAdaptiveTimeoutMs ?? 240000
        const adaptiveTimeoutMs = Math.min(
            maxAdaptiveTimeoutMs,
            Math.max(baseUploadTimeoutMs, baseUploadTimeoutMs + (blobSizeMb * uploadTimeoutPerMbMs))
        )
        const uploadRetryOptions = {
            policyKey: 'uploadForm',
            attempts: uploadPolicy.attempts ?? 4,
            timeoutMs: adaptiveTimeoutMs,
            retryDelayMs: uploadPolicy.retryDelayMs ?? 600,
            maxRetryDelayMs: uploadPolicy.maxRetryDelayMs ?? 7000
        }

        return await apiService.postFormData(UPLOAD_URL, params, signal, uploadRetryOptions)
            .then(response => {
                if(response.success){
                    debugLog("file transferred successfully", this.fileName)
                    return true;
                }else if(response.aborted){
                    debugLog("file transfer aborted", this.fileName)
                    return false;
                }else{
                    this.lastSaveError = response?.message ?? "unknown error"
                    this.lastSaveRetryable = AreaZipFile.isRetryableLocalSaveError(this.lastSaveError)

                    console.error("file save failed", this.fileName, this.lastSaveError);
                    if(reportFailure){
                        postMessage({
                            name: "download-status",
                            file: this,
                            success: false,
                            code: this.lastSaveRetryable === false ? 'local_save_failed_non_retryable' : 'local_save_failed',
                            stage: 'save',
                            retryable: this.lastSaveRetryable !== false,
                            message: this.lastSaveError
                        });
                    }
                    return false;
                }
            }
            ).catch((error) => {
                if(error.name !="AbortError"){
                    this.lastSaveError = error?.message ?? 'Unknown save error'
                    this.lastSaveRetryable = AreaZipFile.isRetryableLocalSaveError(this.lastSaveError)
                    console.error('Save file error:', this.fileName, error);
                    return false;
                }
            })
    }
    /**
     * Unzips the given file on the users machine by calling the local node server. The node server will also handle deletion of the zip file after unzipping.
     * @param {*} destination 
     * @param {*} overwrite 
     * @returns 
     */
    async unzipAreaSymbol(destination, overwrite, reportFailure = true){
        let params = [];
        params.push({name: 'file', value: this.fileName});
        params.push({name: 'location', value: destination});
        params.push({name: 'overwrite', value: overwrite ? 1 : 0});

        const unzipPolicy = getStageRetryPolicy('unzipForm')

        // Local unzip should fail fast enough to avoid long perceived stalls.
        const unzipRetryOptions = {
            policyKey: 'unzipForm',
            attempts: unzipPolicy.attempts ?? 3,
            timeoutMs: unzipPolicy.timeoutMs ?? 180000,
            retryDelayMs: unzipPolicy.retryDelayMs ?? 500,
            maxRetryDelayMs: unzipPolicy.maxRetryDelayMs ?? 4000
        }

        return await apiService.postFormData(UNZIP_URL, params, signal, unzipRetryOptions)
            .then(response => {
                if(response.success){
                    debugLog("file unzipped successfully", this.fileName)
                    unfinishedAreasymbols = unfinishedAreasymbols.filter(area => area !== this.areaSymbol)
                    postMessage({name: "download-status", file: this, success: true});
                    return true;
                }else if(response.aborted){
                    debugLog("file unzip aborted", this.fileName)
                    return false;
                }else{
                    const unzipErrorMessage = response?.message ?? 'Unzip failed.'
                    debugLog("file unzip failed", this.fileName, unzipErrorMessage)
                    if(reportFailure){
                        postMessage({
                            name: "download-status",
                            file: this,
                            success: false,
                            code: 'local_unzip_failed',
                            stage: 'unzip',
                            retryable: true,
                            message: unzipErrorMessage
                        });
                    }
                    return false;
                }
            }
            ).catch((error) => {
                if(error.name !="AbortError"){
                    const unzipErrorMessage = error?.message ?? 'Unzip failed.'
                    console.error('Unzip file error:', this.fileName, error);
                    if(reportFailure){
                        postMessage({
                            name: "download-status",
                            file: this,
                            success: false,
                            code: 'local_unzip_failed',
                            stage: 'unzip',
                            retryable: true,
                            message: unzipErrorMessage
                        });
                    }
                    return false;
                }
            })
    }
}

/**
 * This function does 4 things. 
 * 1. Identify the areas selected on the map and gathers the file name from WSS
 * 2. Reads the area symbol zip file from WSS
 * 3. Saves the zipfile to the local machine
 * 4. Unzips the file and removes the zip file
 * @param {[string]} areaSymbols 
 * @param {string} destination 
 * @param {bool} overwrite 
 * @returns Promise
 */
async function downloadSurveyAreas(areaSymbols, destination, overwrite){
    if(!activeProfileSettings){
        activeProfileSettings = getProfileSettings(activeDownloadProfile)
    }

    const profiledTargets = getProfiledConcurrencyTargets(cpuThreads, activeProfileSettings)
    const maxConcurrentRequests = Math.min(
        profiledTargets.pipeline,
        Math.max(activeProfileSettings.minConcurrency.pipeline, areaSymbols.length)
    )
    const maxConcurrentLocalOps = Math.min(
        profiledTargets.localIo,
        maxConcurrentRequests
    )
    const maxConcurrentUploads = Math.min(
        profiledTargets.upload,
        maxConcurrentLocalOps
    )
    const minPipelineConcurrency = Math.max(
        activeProfileSettings.minConcurrency.pipeline,
        Math.min(8, maxConcurrentRequests)
    )
    const minLocalIoConcurrency = Math.max(
        activeProfileSettings.minConcurrency.localIo,
        Math.min(6, maxConcurrentLocalOps)
    )
    const minUploadConcurrency = Math.max(
        activeProfileSettings.minConcurrency.upload,
        Math.min(2, maxConcurrentUploads)
    )
    const startUploadRatio = Number(activeProfileSettings.startUploadRatio ?? 0.75)
    const startUploadConcurrency = Math.max(
        minUploadConcurrency,
        Math.min(maxConcurrentUploads, Math.max(1, Math.ceil(maxConcurrentUploads * startUploadRatio)))
    )

    const limit = pLimit({concurrency: maxConcurrentRequests, rejectOnClear: true})
    const uploadLimit = pLimit({concurrency: startUploadConcurrency, rejectOnClear: true})
    const ioLimit = pLimit({concurrency: maxConcurrentLocalOps, rejectOnClear: true})

    let uploadSuccessStreak = 0
    let governorIntervalId = null
    let lastBackpressureLogMs = 0
    const governorState = {
        lastAdjustmentMs: 0,
        lastRuntimeSampleMs: 0,
        runtimeSnapshot: null,
    }

    initializeRunTelemetry(areaSymbols.length, destination, overwrite)
    clearDownloadTelemetryInterval()
    telemetryIntervalId = setInterval(() => {
        emitRunTelemetry('minute', limit, uploadLimit, ioLimit).catch(() => {})
    }, 60000)
    await emitRunTelemetry('start', limit, uploadLimit, ioLimit)

    const clampConcurrency = (value, minValue, maxValue) => {
        return Math.max(minValue, Math.min(maxValue, value))
    }

    const parseRuntimeMetric = (value) => {
        const parsed = Number(value)
        return Number.isFinite(parsed) ? parsed : null
    }

    const clearGovernorInterval = () => {
        if(governorIntervalId != null){
            clearInterval(governorIntervalId)
            governorIntervalId = null
        }
    }

    const buildQueueRuntimeSnapshot = () => {
        return {
            queue: getQueueSnapshot(limit, uploadLimit, ioLimit),
            runtime: governorState.runtimeSnapshot,
        }
    }

    const postGovernorEvent = ({
        reason,
        severity = 'info',
        message,
        source,
        before,
        after,
        snapshot,
        countAsAdjustment = true,
    }) => {
        if(countAsAdjustment && runTelemetry){
            runTelemetry.governorAdjustments += 1
        }

        const governorEvent = {
            timestampUtc: new Date().toISOString(),
            reason,
            severity,
            message,
            source,
            before,
            after,
            queue: snapshot?.queue,
            runtime: snapshot?.runtime,
        }
        postMessage({name: 'download-governor', governor: governorEvent})

        const summary = (
            `downloadGovernor reason=${reason}`
            + ` severity=${severity}`
            + ` source=${source ?? 'unknown'}`
            + ` pipeline=${after?.pipeline ?? limit.concurrency}`
            + ` upload=${after?.upload ?? uploadLimit.concurrency}`
            + ` io=${after?.io ?? ioLimit.concurrency}`
            + ` message=${message}`
        )
        const logLevelPrefix = severity === 'warning' ? 'warning' : 'info'
        postLoggerMessage(logLevelPrefix, summary).catch(() => {})
    }

    const applyConcurrencyTargets = (
        targets,
        {
            reason = 'governor_adjustment',
            severity = 'info',
            message = 'Concurrency adjusted by adaptive governor.',
            source = 'adaptive-governor',
        } = {}
    ) => {
        const previous = {
            pipeline: limit.concurrency,
            upload: uploadLimit.concurrency,
            io: ioLimit.concurrency,
        }

        const nextTargets = {
            pipeline: clampConcurrency(
                Number.isFinite(targets?.pipeline) ? targets.pipeline : previous.pipeline,
                minPipelineConcurrency,
                maxConcurrentRequests
            ),
            upload: clampConcurrency(
                Number.isFinite(targets?.upload) ? targets.upload : previous.upload,
                minUploadConcurrency,
                maxConcurrentUploads
            ),
            io: clampConcurrency(
                Number.isFinite(targets?.io) ? targets.io : previous.io,
                minLocalIoConcurrency,
                maxConcurrentLocalOps
            ),
        }

        const changed = (
            nextTargets.pipeline !== previous.pipeline
            || nextTargets.upload !== previous.upload
            || nextTargets.io !== previous.io
        )
        if(!changed){
            return false
        }

        limit.concurrency = nextTargets.pipeline
        uploadLimit.concurrency = nextTargets.upload
        ioLimit.concurrency = nextTargets.io

        postGovernorEvent({
            reason,
            severity,
            message,
            source,
            before: previous,
            after: nextTargets,
            snapshot: buildQueueRuntimeSnapshot(),
            countAsAdjustment: true,
        })
        governorState.lastAdjustmentMs = Date.now()
        return true
    }

    const computeGovernorTargets = (snapshot) => {
        const queue = snapshot.queue
        const cpuPercent = parseRuntimeMetric(snapshot.runtime?.cpuPercent)
        const memoryPercent = parseRuntimeMetric(snapshot.runtime?.memoryPercent)

        const runtimeHealthy = (
            (cpuPercent == null || cpuPercent < 82)
            && (memoryPercent == null || memoryPercent < 85)
        )
        const resourcePressure = (
            (cpuPercent != null && cpuPercent >= 92)
            || (memoryPercent != null && memoryPercent >= 90)
        )

        const uploadBacklogHigh = queue.uploadPending > Math.max(8, queue.uploadConcurrency * 3)
        const ioBacklogHigh = queue.ioPending > Math.max(8, queue.ioConcurrency * 3)
        const pipelineBacklogHigh = queue.pipelinePending > Math.max(16, queue.pipelineActive * 4, limit.concurrency * 5)

        const queuesIdle = (
            queue.pipelinePending === 0
            && queue.uploadPending === 0
            && queue.ioPending === 0
            && queue.pipelineActive <= Math.max(1, Math.floor(limit.concurrency / 2))
        )

        if(resourcePressure){
            return {
                targets: {
                    pipeline: limit.concurrency - 1,
                    upload: uploadLimit.concurrency - 1,
                    io: ioLimit.concurrency - 1,
                },
                reason: 'resource_pressure_scale_down',
                severity: 'warning',
                message: `Resource pressure detected (cpu=${cpuPercent ?? 'na'}, mem=${memoryPercent ?? 'na'}).`,
            }
        }

        if(uploadBacklogHigh && runtimeHealthy){
            return {
                targets: {
                    upload: uploadLimit.concurrency + 1,
                    io: ioLimit.concurrency + (ioBacklogHigh ? 1 : 0),
                },
                reason: 'upload_backlog_scale_up',
                severity: 'info',
                message: 'Upload queue pressure high; scaling upload and local IO lanes.',
            }
        }

        if(ioBacklogHigh && runtimeHealthy){
            return {
                targets: {
                    io: ioLimit.concurrency + 1,
                },
                reason: 'io_backlog_scale_up',
                severity: 'info',
                message: 'Local IO queue pressure high; scaling IO lane.',
            }
        }

        if(pipelineBacklogHigh && runtimeHealthy && !uploadBacklogHigh){
            return {
                targets: {
                    pipeline: limit.concurrency + 1,
                },
                reason: 'pipeline_backlog_scale_up',
                severity: 'info',
                message: 'Pipeline queue pressure high; scaling pipeline lane.',
            }
        }

        if(queuesIdle){
            return {
                targets: {
                    pipeline: limit.concurrency - 1,
                    upload: uploadLimit.concurrency - 1,
                    io: ioLimit.concurrency - 1,
                },
                reason: 'idle_scale_down',
                severity: 'info',
                message: 'Queues are idle; scaling down to stabilize host load.',
            }
        }

        return null
    }

    const runAdaptiveGovernorCycle = async (trigger = 'interval') => {
        const nowMs = Date.now()
        if(trigger !== 'startup' && nowMs - governorState.lastAdjustmentMs < 4000){
            return
        }

        if(trigger === 'startup' || nowMs - governorState.lastRuntimeSampleMs >= 20000){
            governorState.runtimeSnapshot = await fetchRuntimeTelemetrySnapshot()
            governorState.lastRuntimeSampleMs = nowMs
        }

        const snapshot = buildQueueRuntimeSnapshot()
        const targetDecision = computeGovernorTargets(snapshot)
        if(!targetDecision){
            return
        }

        applyConcurrencyTargets(targetDecision.targets, {
            reason: `${trigger}:${targetDecision.reason}`,
            severity: targetDecision.severity,
            message: targetDecision.message,
            source: 'adaptive-governor',
        })
    }

    const throwIfCancelled = () => {
        if(cancel_download){
            limit.clearQueue()
            uploadLimit.clearQueue()
            ioLimit.clearQueue()
            throw AbortSignal.abort().reason
        }
    }

    const pauseForRecovery = (delayMs) => {
        const ms = Number.isFinite(delayMs) ? Math.max(0, delayMs) : 0
        return new Promise((resolve) => setTimeout(resolve, ms))
    }

    const isTransientNetworkFailure = (error) => {
        const message = String(error?.message ?? '').toLowerCase()
        return (
            error instanceof TypeError
            || message.includes('failed to fetch')
            || message.includes('networkerror')
            || message.includes('timed out')
            || message.includes('timeout')
            || message.includes('load failed')
        )
    }

    const getPipelineBackpressureCapacity = () => {
        const backpressureScale = Number(activeProfileSettings?.backpressureScale ?? 1)
        const dynamicCapacity = (limit.concurrency * 3) + (uploadLimit.concurrency * 2) + ioLimit.concurrency
        return Math.max(12, Math.floor(dynamicCapacity * backpressureScale))
    }

    const getIoBackpressureCapacity = () => {
        const backpressureScale = Number(activeProfileSettings?.backpressureScale ?? 1)
        const dynamicCapacity = (ioLimit.concurrency * 3) + uploadLimit.concurrency
        return Math.max(8, Math.floor(dynamicCapacity * backpressureScale))
    }

    const logBackpressureSignal = (stage, trackedCount, capacity) => {
        const nowMs = Date.now()
        if(nowMs - lastBackpressureLogMs < 12000){
            return
        }

        lastBackpressureLogMs = nowMs
        if(runTelemetry){
            runTelemetry.backpressureActivations += 1
        }

        postGovernorEvent({
            reason: 'backpressure_window_engaged',
            severity: 'warning',
            message: `Backpressure engaged for ${stage}; queued=${trackedCount}, capacity=${capacity}.`,
            source: 'queue-backpressure',
            before: {
                pipeline: limit.concurrency,
                upload: uploadLimit.concurrency,
                io: ioLimit.concurrency,
            },
            after: {
                pipeline: limit.concurrency,
                upload: uploadLimit.concurrency,
                io: ioLimit.concurrency,
            },
            snapshot: buildQueueRuntimeSnapshot(),
            countAsAdjustment: false,
        })
    }

    const waitForBackpressureWindow = async (trackedPromises, stage, capacityResolver) => {
        while(trackedPromises.size >= capacityResolver()){
            throwIfCancelled()
            const capacity = capacityResolver()
            logBackpressureSignal(stage, trackedPromises.size, capacity)
            await Promise.race(
                Array.from(trackedPromises).map((promise) => promise.catch(() => null))
            )
            await runAdaptiveGovernorCycle('backpressure')
        }
    }

    const trackPromise = (trackedPromises, promise) => {
        let trackedPromise = null
        trackedPromise = promise.finally(() => {
            trackedPromises.delete(trackedPromise)
        })
        trackedPromises.add(trackedPromise)
    }

    const increaseUploadConcurrency = () => {
        uploadSuccessStreak += 1
        const successThreshold = Math.max(2, Number(activeProfileSettings?.uploadSuccessThreshold ?? 4))
        if(uploadSuccessStreak < successThreshold){
            return
        }

        uploadSuccessStreak = 0
        applyConcurrencyTargets(
            {upload: uploadLimit.concurrency + 1},
            {
                reason: 'save_success_streak_scale_up',
                severity: 'info',
                message: 'Stable save throughput observed; increasing upload lane.',
                source: 'save-feedback',
            }
        )
    }

    const decreaseUploadConcurrency = () => {
        uploadSuccessStreak = 0
        applyConcurrencyTargets(
            {upload: uploadLimit.concurrency - 1},
            {
                reason: 'save_retryable_failure_scale_down',
                severity: 'warning',
                message: 'Retryable save failure observed; reducing upload lane.',
                source: 'save-feedback',
            }
        )
    }

    await runAdaptiveGovernorCycle('startup')
    clearGovernorInterval()
    governorIntervalId = setInterval(() => {
        runAdaptiveGovernorCycle('interval').catch(() => {})
    }, 5000)

    unfinishedAreasymbols = areaSymbols
    let pipelineErrorStreak = 0

    const runExistingArchiveBatch = async (filesToUnzip, reportFailure) => {
        const retryFiles = []
        const trackedUnzipPipelines = new Set()

        for(const file of filesToUnzip){
            throwIfCancelled()
            await waitForBackpressureWindow(
                trackedUnzipPipelines,
                'existing-archive-io',
                getIoBackpressureCapacity
            )

            const unzipPromise = ioLimit(async () => {
                const fileObj = new AreaZipFile(file.areaSymbol, file.areaName, file.fileName)
                try{
                    throwIfCancelled()
                    const unzipped = await fileObj.unzipAreaSymbol(destination, overwrite, reportFailure)
                    if(!unzipped){
                        noteRetryQueued(1)
                        retryFiles.push(file)
                    }
                }
                catch(error){
                    if(isUserCancelledError(error)){
                        return
                    }

                    if(reportFailure){
                        postMessage({
                            name: "download-status",
                            file: fileObj,
                            success: false,
                            code: 'existing_archive_unzip_failed',
                            stage: 'unzip',
                            retryable: true,
                            message: error?.message ?? 'failed download.'
                        })
                    }
                    noteRetryQueued(1)
                    retryFiles.push(file)
                }
            })

            trackPromise(trackedUnzipPipelines, unzipPromise)
        }

        await Promise.allSettled(Array.from(trackedUnzipPipelines))
        return retryFiles
    }

    const runBatch = async (downloadFiles, reportFailure) => {
        const retryFiles = []
        const trackedPipelines = new Set()

        for(const file of downloadFiles){
            throwIfCancelled()
            await waitForBackpressureWindow(
                trackedPipelines,
                'pipeline',
                getPipelineBackpressureCapacity
            )

            const pipelinePromise = limit(async () => {
                const fileObj = new AreaZipFile(file.areaSymbol, file.areaName, file.fileName)
                try{
                    throwIfCancelled()
                    await fileObj.readLargeFile()
                    throwIfCancelled()

                    const saved = await uploadLimit(() =>
                        fileObj.saveZipFile(destination, overwrite, reportFailure)
                    )

                    if(saved){
                        increaseUploadConcurrency()
                    }
                    else if(fileObj.lastSaveRetryable !== false){
                        decreaseUploadConcurrency()
                        await runAdaptiveGovernorCycle('save-retryable-failure')
                    }

                    throwIfCancelled()
                    if(!saved){
                        const saveRetryable = fileObj.lastSaveRetryable !== false
                        if(!reportFailure){
                            if(saveRetryable){
                                console.error(
                                    "Download failed for file ",
                                    file.fileName,
                                    " during save step. Adding to retry list."
                                )
                                noteRetryQueued(1)
                                retryFiles.push(file)
                            }
                            else{
                                console.error(
                                    "Download failed for file ",
                                    file.fileName,
                                    " during save step with non-retryable local filesystem error:",
                                    fileObj.lastSaveError
                                )
                                postMessage({
                                    name: "download-status",
                                    file: fileObj,
                                    success: false,
                                    message: fileObj.lastSaveError
                                })
                            }
                        }
                        return
                    }

                    const unzipped = await ioLimit(() =>
                        fileObj.unzipAreaSymbol(
                            destination,
                            overwrite || file.forceOverwrite === true,
                            reportFailure
                        )
                    )
                    if(!unzipped && !reportFailure){
                        console.error(
                            "Download failed for file ",
                            file.fileName,
                            " during unzip step. Adding to retry list."
                        )
                        noteRetryQueued(1)
                        retryFiles.push(file)
                    }

                    pipelineErrorStreak = Math.max(0, pipelineErrorStreak - 1)
                }
                catch(error){
                    if(isUserCancelledError(error)){
                        return
                    }

                    console.error("Download pipeline error:", error?.message ?? error)

                    if(isTransientNetworkFailure(error)){
                        pipelineErrorStreak += 1

                        if(pipelineErrorStreak >= 3){
                            applyConcurrencyTargets(
                                {
                                    pipeline: limit.concurrency - 2,
                                    upload: uploadLimit.concurrency - 2,
                                    io: ioLimit.concurrency - 1,
                                },
                                {
                                    reason: 'network_fetch_failure_scale_down',
                                    severity: 'warning',
                                    message: `Transient network fetch failures observed (streak=${pipelineErrorStreak}); reducing concurrency and backing off.`,
                                    source: 'network-recovery',
                                }
                            )

                            const recoveryDelayMs = Math.min(5000, 350 + (pipelineErrorStreak * 150))
                            await pauseForRecovery(recoveryDelayMs)
                        }
                    }
                    else{
                        pipelineErrorStreak = Math.max(0, pipelineErrorStreak - 1)
                    }

                    await runAdaptiveGovernorCycle('pipeline-error')
                    if(reportFailure){
                        postMessage({
                            name: "download-status",
                            file: fileObj,
                            success: false,
                            code: 'download_pipeline_failed',
                            stage: 'pipeline',
                            retryable: true,
                            message: error?.message ?? 'failed download.'
                        })
                    }
                    else{
                        console.error(
                            "Download failed for file ",
                            file.fileName,
                            " with error: ",
                            error?.message,
                            " Adding to retry list."
                        )
                        noteRetryQueued(1)
                        retryFiles.push(file)
                    }
                }
            })

            trackPromise(trackedPipelines, pipelinePromise)
        }

        await Promise.allSettled(Array.from(trackedPipelines))
        return retryFiles
    }

    const refreshDownloadFilesForRetry = async (failedFiles) => {
        if(!Array.isArray(failedFiles) || failedFiles.length === 0){
            return []
        }

        const failedAreaSymbols = Array.from(new Set(
            failedFiles
                .map(file => String(file?.areaSymbol ?? '').trim())
                .filter(Boolean)
        ))

        if(failedAreaSymbols.length === 0){
            return []
        }

        const refreshedFiles = await getDownloadUrls(failedAreaSymbols, {preferCache: true})
        if(!Array.isArray(refreshedFiles) || refreshedFiles.length === 0){
            return failedFiles
        }

        const refreshedMap = new Map(
            refreshedFiles.map(file => [file.areaSymbol, file])
        )
        return failedAreaSymbols
            .map(areaSymbol => {
                return refreshedMap.get(areaSymbol)
                    ?? failedFiles.find(file => file.areaSymbol === areaSymbol)
            })
            .filter(Boolean)
    }

    try{
        throwIfCancelled()
        const downloadUrls = await getDownloadUrls(areaSymbols)
        throwIfCancelled()

        const {existingFiles, missingFiles} = await splitExistingArchives(
            downloadUrls,
            destination,
            overwrite
        )
        throwIfCancelled()

        const existingArchivePromise = runExistingArchiveBatch(existingFiles, false)

        const primaryDownloadFiles = await markFilesRequiringOverwrite(
            missingFiles,
            destination,
            overwrite
        )
        throwIfCancelled()

        const retryUrls = await runBatch(primaryDownloadFiles, false)
        throwIfCancelled()

        const fallbackFromExisting = await existingArchivePromise
        throwIfCancelled()

        let secondaryRetryUrls = []
        if(fallbackFromExisting.length > 0){
            const fallbackDownloadFiles = await markFilesRequiringOverwrite(
                fallbackFromExisting,
                destination,
                overwrite
            )
            throwIfCancelled()
            secondaryRetryUrls = await runBatch(fallbackDownloadFiles, false)
            throwIfCancelled()
        }

        let pendingRetryFiles = retryUrls.concat(secondaryRetryUrls)
        if(pendingRetryFiles.length > 0){
            const retryUploadRatio = Number(activeProfileSettings?.retryUploadRatio ?? 0.75)
            const retryUploadConcurrency = Math.max(
                minUploadConcurrency,
                Math.min(maxConcurrentUploads, Math.ceil(startUploadConcurrency * retryUploadRatio))
            )
            uploadLimit.concurrency = retryUploadConcurrency

            const maxRefreshPasses = Math.max(1, Number(activeProfileSettings?.maxRefreshPasses ?? 3))
            for(let pass = 1; pass <= maxRefreshPasses && pendingRetryFiles.length > 0; pass++){
                throwIfCancelled()
                const refreshedRetryFiles = await refreshDownloadFilesForRetry(pendingRetryFiles)
                throwIfCancelled()
                pendingRetryFiles = await runBatch(refreshedRetryFiles, false)
            }

            if(pendingRetryFiles.length > 0){
                uploadLimit.concurrency = 1
                const finalRetryFiles = await refreshDownloadFilesForRetry(pendingRetryFiles)
                await runBatch(finalRetryFiles, true)
            }
        }
    }
    catch(error){
        if(isUserCancelledError(error)){
            limit.clearQueue()
            uploadLimit.clearQueue()
            ioLimit.clearQueue()
            return
        }

        throw error
    }
    finally{
        clearGovernorInterval()
        clearDownloadTelemetryInterval()
        const finalStage = cancel_download ? 'cancelled' : 'final'
        await emitRunTelemetry(finalStage, limit, uploadLimit, ioLimit)
        runTelemetry = null
    }
}
export {AreaZipFile, getDownloadUrls, downloadSurveyAreas};