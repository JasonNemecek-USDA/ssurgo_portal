//Eventually this will include other items related to the database
import {deleteAreaSymbolRequest, importCandidatesRequest, generateRastersRequest} from "./Constants.mjs"
import { sendRequest } from "./GeneralHelpers.mjs"
 
export default class DatabaseFunctions{
    constructor(){
        this.progressDisplayComp = document.getElementById("progressdisplay")
        this.databasePath = null
        this.databaseName = null
        this.isTabularOnly = null
        this.failedCounter = 0
        this.successCounter = 0
        this.databaseTable = null
        this.importTable = null
        this.stopActionHandler = null
        this.deleteInProgress = false
        this.importInProgress = false
        this.deleteClickHandler = null
        this.importClickHandler = null
    }

    replaceStopActionListener(handler){
        if(this.stopActionHandler){
            this.progressDisplayComp.removeEventListener("onStopAction", this.stopActionHandler)
        }
        this.stopActionHandler = handler
        this.progressDisplayComp.addEventListener("onStopAction", this.stopActionHandler)
    }

    async deleteCandidates(){
        if(this.deleteInProgress){
            return
        }

        this.deleteInProgress = true
        try{
        //set values
        let stopProgress = false
        const subfolders = this.databaseTable.selectedCheckboxes
        const action = "delete";
        const continueDelete = await deleteDatabaseWarning()
        if(!continueDelete){
            return
        }
        this.replaceStopActionListener(() => {
            stopProgress = true
        })

        this.progressDisplayComp.progressTitle = "Deleting data...";
        this.progressDisplayComp.progressCounterMessage = `0 out of ${subfolders.length} records deleted`;
        this.progressDisplayComp.progressListButtonText = "Click to see list of deleted areas";

        this.progressDisplayComp.progressScreenSetup(subfolders, action);     

        //Define scope variables
        let successfulFolders = []
        let failedFolders = []
        this.successCounter = 0
        this.failedCounter = 0
        //Determine tabular only
        this.isTabularOnly = document.getElementById('loadTabularData').checked
        for(const folder in subfolders){
            /*Stop button has a function. This function sets a global variable that will need to be reset at the end of the cancelation*/
            if(!stopProgress){
                this.progressDisplayComp.progressText = `Deleting ${subfolders[folder]} from your database...`;
                let deleteRequest = {
                    'request': deleteAreaSymbolRequest, 'database': this.databasePath, 'areasymbols' : [subfolders[folder]]
                }
                let response = await sendRequest(deleteRequest)
                //Response is good
                if (response && response.status){
                    successfulFolders.push(subfolders[folder])

                    this.progressDisplayComp.successValue++;                         
                    this.progressDisplayComp.progressCounterMessage = `${this.progressDisplayComp.successValue} out of ${subfolders.length} records deleted. ${this.progressDisplayComp.failValue} deletes failed.`;

                }
                //If the import response has a status of false
                else{
                    const errorData = {"areaname": subfolders[folder], "errormessage": response && response.errormessage ? response.errormessage : `Unknown error for ${subfolders[folder]}` }
                    failedFolders.push(errorData)
                    this.progressDisplayComp.failValue++;                     
                    this.progressDisplayComp.progressCounterMessage = `${this.progressDisplayComp.successValue} out of ${subfolders.length} records deleted. ${this.progressDisplayComp.failValue} deletes failed.`; 
                    this.progressDisplayComp.populateErrorMessage(`${errorData.areaname}: Error Message: ${errorData.errormessage}`);
                }
            }
            else { //Import process stopped
                console.log('Stopped import')
                break
            }
        }

        this.progressDisplayComp.stop(successfulFolders, failedFolders, action, true);

        //hack for homePageContainer to show after delete
        $("#selectDatabasePage, #homePageContainer").toggle();
        this.databaseTable.selectedCheckboxes = [];
        await selectDatabase(this.databasePath.slice(0, (-this.databaseName.length - 1)), this.databasePath);        
        }
        finally{
            this.deleteInProgress = false
        }
    }

    async importCandidates(skipPretest = true,  loadInSpatialOrder = false, loadspatialdatawithinsubprocess = false, isDissolve = true, includeSubRules = false){
        if(this.importInProgress){
            this.progressDisplayComp.populateErrorMessage("Import already in progress. Wait for the current run to finish.")
            return
        }

        this.importInProgress = true
        try{
        //set values
        let stopProgress = false;
        let subfolders = this.importTable.selectedCheckboxes;
        let success = true;
        /*Pre-import actions:
            First we check to see if the user is trying to import a deleted SSURGO folder
            Secondly we check to see if the user is trying to import 2 or more of the same SSURGO Area
            Finally we wait for user input if they are trying to import an area that already exists in the database
        */
    
        //Check if error validation text is present. If it is, that means Override Grid Size input is invalid. 
        let validationText = document.getElementById("validationTextOverrideGridSize")
        if (validationText.style.display == "block") {
            // exit function and do not import since input is not valid 
            return
        }
    
        //Check to see if the folder exists
        let deletedFolders = []   
        let selectedFolderPaths = []
        for(let folder in subfolders){
            selectedFolderPaths.push(`${this.folderPath}/${subfolders[folder]}`)
        }
        deletedFolders = await doesPathExist(selectedFolderPaths)
        if(deletedFolders?.status === "server_unavailable"){
            this.progressDisplayComp.populateErrorMessage("Unable to connect to the local portal server. Confirm SSURGO Portal is still running, then retry import.")
            return
        }
        if(deletedFolders["failedfolders"].length != 0){
            document.getElementById('missingObjectModalBtn').click()
            //Clear any active listeners
            $("#closeMissingObjectModal").off()
            $("#closeMissingObjectModal").on("click", () => {ImportActivities.selectSSAParentFolder(this.folderPath, false, undefined, false)})
            //Clear any active listeners
            $("#closeMissingObjectModalBtn").off()
            $("#closeMissingObjectModalBtn").on("click", () => {ImportActivities.selectSSAParentFolder(this.folderPath, false, undefined, false)})
            document.getElementById('missingObjectModal').addEventListener('click', function(e) {
                if(e.target.className == 'usa-modal-overlay') {
                    document.getElementById("closeMissingObjectModalBtn").click()
                }
            })
            for(let folder in deletedFolders.failedfolders){
                //Remove all deleted folders from the selected list.
                let filterFolder = deletedFolders.failedfolders[folder].replace(`${this.folderPath}/`, "")
                function removeValue(value, index, arr){
                    if(value === filterFolder){
                        arr.splice(index, 1)
                        return true
                    }
                    return false
                }
                this.importTable.selectedCheckboxes = this.importTable.selectedCheckboxes.filter(removeValue)
            }
            return
        }
        //A check to see if the user is trying to import duplicate AOIs within an import action
        let containsDuplicateSSA = checkForDuplicateSSA(subfolders)
        if(containsDuplicateSSA){
            return
        }
        //Await user feedback if trying to import both SSURGO and STATSGO2 data.
        let overrideDiffDataSources = await checkForDifferentDataSource(subfolders)
        if(!overrideDiffDataSources){
            return
        }
        //Await user feedback if trying to import an AOI that aready exists in the DB.
        let overrideExistingSSA = await checkForExistingSSA()
        let action = "import"
        // //If no duplicates are found:
        if(overrideExistingSSA && overrideDiffDataSources){
            // // call progressDisplay class constructor to define elements
    
            this.replaceStopActionListener(() => {
                stopProgress = true
            })
            this.progressDisplayComp.progressTitle = "Importing data...";
            this.progressDisplayComp.progressCounterMessage = `0 out of ${subfolders.length} imports loaded`;
            this.progressDisplayComp.progressListButtonText = "Click to see list of imported areas";        
            this.progressDisplayComp.progressScreenSetup(subfolders, action);
            
            let progressBarContainer = document.getElementById("progressBarSuccessContainerId")
            let loadingSpinner = document.getElementById("loadingSpinnerContainerId")
            let doneLoadingCheckmark = document.getElementById("doneLoadingImgId")
            let failedLoadingX = document.getElementById("failedLoadingImgId")
            Object.assign(progressBarContainer, {
                style: "display: initial",
            })
            Object.assign(loadingSpinner, {
                style: "display: none",
            })
            Object.assign(doneLoadingCheckmark, {
                style: "display: none",
            })
            Object.assign(failedLoadingX, {
                style: "display: none",
            })
    
            //Define scope variables
            let successfulFolders = []
            let failedFolders = []
            this.successCounter = 0
            this.failedCounter = 0
            //Determine tabular only
            this.isTabularOnly = document.getElementById('loadTabularData').checked
            /*
            //This functionality will be implemented Post Prototype.
            TODO: Enable spatial sort in SSURGO Portal UI
            //Determine spatial sorting
            loadInSpatialOrder = document.getElementById('spatialSort').checked*/
            //Determine if the user is not dissolving
            isDissolve = !document.getElementById('dissolve').checked
            includeSubRules = document.getElementById('includeInterpretationSubRules').checked
            let doGenerateRasters = document.getElementById('generateRaster').checked
            const processedFolders = new Set()
            const isLargeImport = subfolders.length >= 300
            const isNationalScaleImport = subfolders.length >= 3000
            const maxSingleFallbackRetries = isLargeImport ? 8 : 20
            const waitForDelay = (delayMs) => new Promise((resolve) => setTimeout(resolve, delayMs))
            const isLockMessage = (message) => /database is locked|locked/i.test(String(message ?? ""))
            const determineImportBatchSize = (folderCount) => {
                if(folderCount >= 3000){
                    return 192
                }
                if(folderCount >= 2000){
                    return 160
                }
                if(folderCount >= 1200){
                    return 128
                }
                if(folderCount >= 800){
                    return 96
                }
                if(folderCount >= 300){
                    return 64
                }
                if(folderCount >= 120){
                    return 48
                }
                return 24
            }
            const importBatchSize = determineImportBatchSize(subfolders.length)
            const importOptimizerProfile = isNationalScaleImport ? "national" : "balanced"
            const shouldUseSpatialSubprocess = !this.isTabularOnly && (loadspatialdatawithinsubprocess || isNationalScaleImport)
            const updateMbrEveryBatches = isNationalScaleImport ? 6 : 1
            const adaptiveBatchMinSize = isNationalScaleImport ? 48 : 24
            const adaptiveBatchMaxSize = isNationalScaleImport ? 256 : Math.max(importBatchSize, 96)
            const adaptiveTargetBatchMs = isNationalScaleImport ? 30000 : 18000
            let currentImportBatchSize = importBatchSize
            let activeBatchFolders = new Set()

            if(isNationalScaleImport && shouldUseSpatialSubprocess && !loadspatialdatawithinsubprocess){
                this.progressDisplayComp.populateErrorMessage(
                    "Performance mode enabled for national-scale import: spatial subprocess mode was auto-enabled to improve throughput."
                )
            }

            const normalizeAdaptiveBatchSize = (requestedSize) => {
                const boundedSize = Math.max(adaptiveBatchMinSize, Math.min(adaptiveBatchMaxSize, Number(requestedSize) || importBatchSize))
                const alignedSize = Math.round(boundedSize / 8) * 8
                return Math.max(adaptiveBatchMinSize, Math.min(adaptiveBatchMaxSize, alignedSize))
            }

            const updateAdaptiveBatchSize = (batchElapsedMs, completedInBatch, hadBatchFailure, wasLockFailure = false) => {
                if(hadBatchFailure || wasLockFailure){
                    currentImportBatchSize = normalizeAdaptiveBatchSize(Math.floor(currentImportBatchSize * 0.7))
                    return
                }

                const safeCompletedCount = Math.max(completedInBatch, 1)
                const millisPerFolder = batchElapsedMs / safeCompletedCount
                const projectedTargetSize = adaptiveTargetBatchMs / Math.max(millisPerFolder, 1)
                const smoothedTarget = Math.round((currentImportBatchSize * 0.6) + (projectedTargetSize * 0.4))

                if(batchElapsedMs > adaptiveTargetBatchMs * 1.6){
                    currentImportBatchSize = normalizeAdaptiveBatchSize(Math.min(currentImportBatchSize, Math.floor(smoothedTarget * 0.8)))
                    return
                }

                if(batchElapsedMs < adaptiveTargetBatchMs * 0.6 && completedInBatch >= currentImportBatchSize){
                    currentImportBatchSize = normalizeAdaptiveBatchSize(Math.max(smoothedTarget, currentImportBatchSize + 8))
                    return
                }

                currentImportBatchSize = normalizeAdaptiveBatchSize(smoothedTarget)
            }

            if(isLargeImport && !this.isTabularOnly && isDissolve){
                // Large full-spatial imports are significantly faster when dissolve is disabled.
                isDissolve = false
                this.progressDisplayComp.populateErrorMessage(
                    "Performance mode enabled for large import: Disable Dissolve was auto-enabled to improve throughput."
                )
            }

            const updateImportCounterMessage = () => {
                const completedCount = this.successCounter + this.failedCounter
                const inProgressCount = activeBatchFolders.size
                const queuedCount = Math.max(subfolders.length - completedCount - inProgressCount, 0)
                this.progressDisplayComp.progressCounterMessage = `${completedCount} out of ${subfolders.length} imports processed. ${this.successCounter} loaded, ${this.failedCounter} failed. ${inProgressCount} in progress, ${queuedCount} queued.`
            }

            const isFatalImportErrorMessage = (message) => /database disk image is malformed/i.test(String(message ?? ""))
            let encounteredFatalImportError = false
            let fatalImportErrorMessage = ""
            const stopImportForFatalDatabaseError = (remainingFolders) => {
                const stopMessage = "Import stopped because the target database is malformed. Create/select a new database and re-run import."
                for(const folderName of remainingFolders){
                    markFolderFailure(folderName, stopMessage)
                }
                this.progressDisplayComp.populateErrorMessage(stopMessage)
                stopProgress = true
            }

            const normalizeErrorMessage = (rawMessage, defaultMessage = "An unknown error occurred while importing this folder.") => {
                const msg = String(rawMessage ?? "").trim()
                return msg || defaultMessage
            }

            const markFolderSuccess = (folderName) => {
                if(processedFolders.has(folderName)){
                    return
                }
                processedFolders.add(folderName)
                activeBatchFolders.delete(folderName)
                successfulFolders.push(folderName)
                this.successCounter++
                this.progressDisplayComp.successValue = this.successCounter
                updateImportCounterMessage()
            }

            const markFolderFailure = (folderName, errormessage) => {
                if(processedFolders.has(folderName)){
                    return
                }
                processedFolders.add(folderName)
                activeBatchFolders.delete(folderName)
                const errorData = {"areaname": folderName, "errormessage": normalizeErrorMessage(errormessage)}
                failedFolders.push(errorData)
                if(!encounteredFatalImportError && isFatalImportErrorMessage(errorData.errormessage)){
                    encounteredFatalImportError = true
                    fatalImportErrorMessage = errorData.errormessage
                }
                this.failedCounter++
                this.progressDisplayComp.failValue = this.failedCounter
                updateImportCounterMessage()
                this.progressDisplayComp.populateErrorMessage(`${folderName} Error Message: ${errorData.errormessage}`)
            }

            const setActiveBatchFolders = (folderBatch) => {
                activeBatchFolders = new Set(folderBatch.filter((folderName) => !processedFolders.has(folderName)))
                updateImportCounterMessage()
            }

            const applyBatchResponse = (responsePayload) => {
                const processedInResponse = new Set()
                const responseSubfolders = Array.isArray(responsePayload?.subfolders) ? responsePayload.subfolders : []
                for(const subfolderResponse of responseSubfolders){
                    const folderName = subfolderResponse?.childfoldername
                    if(!folderName){
                        continue
                    }

                    processedInResponse.add(folderName)
                    const folderError = String(subfolderResponse?.errormessage ?? "").trim()
                    if(folderError){
                        markFolderFailure(folderName, folderError)
                    }
                    else{
                        markFolderSuccess(folderName)
                    }
                }

                return {processedInResponse, responseSubfolders}
            }

            const buildImportRequest = (folderBatch, performHousekeeping, updateMbrThisBatch) => {
                return {
                    'request': importCandidatesRequest, 'database': this.databasePath, 'root' : this.folderPath, 'skippretest': skipPretest, 'istabularonly': this.isTabularOnly, 'loadinspatialorder' : loadInSpatialOrder,
                    'loadspatialdatawithinsubprocess' : shouldUseSpatialSubprocess, 'dissolvemupolygon' : isDissolve, 'subfolders' : folderBatch, 'includeinterpretationsubrules' : includeSubRules,
                    'performhousekeeping' : performHousekeeping,
                    'importoptimizerprofile' : importOptimizerProfile,
                    'updatembrthisbatch' : updateMbrThisBatch
                }
            }

            const buildTransportFailureResponse = (errormessage) => {
                return {
                    status: false,
                    transporterror: true,
                    errormessage: normalizeErrorMessage(errormessage, "Unable to connect to the local portal server."),
                    subfolders: []
                }
            }

            const safeImportRequest = async (requestPayload) => {
                try{
                    const responsePayload = await sendRequest(requestPayload)
                    if(responsePayload){
                        return responsePayload
                    }
                    return buildTransportFailureResponse("No response received from the local portal server.")
                }
                catch(requestError){
                    return buildTransportFailureResponse(requestError?.message)
                }
            }

            const isTransportFailureResponse = (responsePayload) => Boolean(responsePayload?.transporterror)
            const transportStopMessage = "Import stopped because the local portal server became unavailable."
            const maxConsecutiveTransportFailures = 2
            let consecutiveTransportFailures = 0

            let batchStart = 0
            let batchIndex = 0
            while(batchStart < subfolders.length){
                if(stopProgress){
                    console.log('Stopped import')
                    break
                }

                currentImportBatchSize = normalizeAdaptiveBatchSize(currentImportBatchSize)
                const batchSubfolders = subfolders.slice(batchStart, batchStart + currentImportBatchSize)
                const isLastBatch = (batchStart + batchSubfolders.length) >= subfolders.length
                if(isLastBatch && !doGenerateRasters){
                    this.progressDisplayComp._hideStopButton = true
                }

                setActiveBatchFolders(batchSubfolders)
                const estimatedBatchCount = Math.max(1, Math.ceil((subfolders.length - batchStart) / currentImportBatchSize) + batchIndex)
                batchIndex++
                const shouldUpdateMbrThisBatch = this.isTabularOnly ? false : (isLastBatch || (batchIndex % updateMbrEveryBatches === 0))

                const batchLabel = batchSubfolders.length > 1
                    ? `${batchSubfolders[0]} (+${batchSubfolders.length - 1} more)`
                    : batchSubfolders[0]
                this.progressDisplayComp.progressText = `Importing batch ${batchIndex} of ~${estimatedBatchCount}: ${batchLabel} into your database...`

                const shouldPerformHousekeeping = isLastBatch
                const batchStartedAt = Date.now()
                const response = await safeImportRequest(buildImportRequest(batchSubfolders, shouldPerformHousekeeping, shouldUpdateMbrThisBatch))
                const batchElapsedMs = Math.max(1, Date.now() - batchStartedAt)
                const completedBeforeFallback = this.successCounter + this.failedCounter
                if(isTransportFailureResponse(response)){
                    consecutiveTransportFailures++
                    const transportError = normalizeErrorMessage(response?.errormessage, "Unable to connect to the local portal server.")
                    for(const folderName of batchSubfolders){
                        markFolderFailure(folderName, transportError)
                    }

                    if(consecutiveTransportFailures >= maxConsecutiveTransportFailures){
                        const remainingFolders = subfolders.slice(batchStart + batchSubfolders.length)
                        for(const folderName of remainingFolders){
                            markFolderFailure(folderName, `${transportStopMessage} Re-run import after the server connection is restored.`)
                        }
                        this.progressDisplayComp.populateErrorMessage(`${transportStopMessage} Imported folders already completed were preserved.`)
                        stopProgress = true
                        break
                    }

                    updateAdaptiveBatchSize(batchElapsedMs, this.successCounter + this.failedCounter - completedBeforeFallback, true, false)
                    batchStart += batchSubfolders.length
                    continue
                }

                consecutiveTransportFailures = 0

                const {processedInResponse, responseSubfolders} = applyBatchResponse(response)
                let batchHadFailure = !response.status
                let batchHadLockFailure = false

                if(!response.status){
                    const batchErrorMessage = normalizeErrorMessage(
                        response?.errormessage ?? response?.message,
                        "Import candidates request failed."
                    )

                    for(const folderName of batchSubfolders){
                        if(!processedFolders.has(folderName)){
                            markFolderFailure(folderName, batchErrorMessage)
                        }
                    }

                    // Do not fan out fallback requests when the batch request itself failed.
                    // This prevents request storms when the database is busy/locked.
                    if(isLockMessage(batchErrorMessage)){
                        batchHadLockFailure = true
                        await waitForDelay(250)
                    }

                    if(isFatalImportErrorMessage(batchErrorMessage)){
                        const remainingGlobalFolders = subfolders.slice(batchStart + batchSubfolders.length)
                        stopImportForFatalDatabaseError(remainingGlobalFolders)
                        break
                    }

                    updateAdaptiveBatchSize(batchElapsedMs, this.successCounter + this.failedCounter - completedBeforeFallback, batchHadFailure, batchHadLockFailure)
                    batchStart += batchSubfolders.length
                    continue
                }

                const unprocessedFolders = batchSubfolders.filter(folderName => !processedInResponse.has(folderName) && !processedFolders.has(folderName))
                if(encounteredFatalImportError){
                    const remainingGlobalFolders = subfolders.slice(batchStart + batchSubfolders.length)
                    this.progressDisplayComp.populateErrorMessage(`Import aborted due to fatal database error: ${fatalImportErrorMessage}`)
                    stopImportForFatalDatabaseError(remainingGlobalFolders)
                    break
                }

                if(response.status && responseSubfolders.length === 0){
                    this.progressDisplayComp.populateErrorMessage(
                        "Import response did not include per-folder statuses; retrying unresolved folders."
                    )
                }

                if(unprocessedFolders.length > 0){
                    let remainingFolders = [...unprocessedFolders]
                    batchHadFailure = true

                    if(remainingFolders.length > 1){
                        const retryLabel = `${remainingFolders[0]} (+${remainingFolders.length - 1} more)`
                        this.progressDisplayComp.progressText = `Retrying ${retryLabel} in a single performance batch...`

                        const bulkRetryResponse = await safeImportRequest(buildImportRequest(remainingFolders, isLastBatch, shouldUpdateMbrThisBatch))
                        if(isTransportFailureResponse(bulkRetryResponse)){
                            const bulkTransportError = normalizeErrorMessage(
                                bulkRetryResponse?.errormessage,
                                "Unable to connect to the local portal server."
                            )
                            for(const folderName of remainingFolders){
                                markFolderFailure(folderName, bulkTransportError)
                            }

                            const remainingGlobalFolders = subfolders.slice(batchStart + batchSubfolders.length)
                            for(const pendingGlobalFolder of remainingGlobalFolders){
                                markFolderFailure(
                                    pendingGlobalFolder,
                                    `${transportStopMessage} Re-run import after the server connection is restored.`
                                )
                            }

                            remainingFolders = []
                            stopProgress = true
                            this.progressDisplayComp.populateErrorMessage(`${transportStopMessage} Imported folders already completed were preserved.`)
                        }
                        else{
                            const bulkProcessed = applyBatchResponse(bulkRetryResponse).processedInResponse
                            remainingFolders = remainingFolders.filter(folderName => !bulkProcessed.has(folderName) && !processedFolders.has(folderName))

                            if(!bulkRetryResponse.status){
                                const bulkRetryError = normalizeErrorMessage(
                                    bulkRetryResponse?.errormessage ?? bulkRetryResponse?.message,
                                    "Import candidates retry request failed."
                                )
                                if(isLockMessage(bulkRetryError)){
                                    batchHadLockFailure = true
                                }
                                for(const folderName of remainingFolders){
                                    markFolderFailure(folderName, bulkRetryError)
                                }
                                remainingFolders = []
                            }
                        }
                    }

                    if(remainingFolders.length > 0){
                        const fallbackFolders = remainingFolders.slice(0, maxSingleFallbackRetries)
                        const skippedFolders = remainingFolders.slice(maxSingleFallbackRetries)

                        if(skippedFolders.length > 0){
                            const skippedRetryError = `Performance mode capped one-by-one retries to ${maxSingleFallbackRetries} folders in this batch. Re-run remaining failed folders if needed.`
                            for(const folderName of skippedFolders){
                                markFolderFailure(folderName, skippedRetryError)
                            }
                        }

                        for(let fallbackIndex = 0; fallbackIndex < fallbackFolders.length; fallbackIndex++){
                            const folderName = fallbackFolders[fallbackIndex]
                            if(stopProgress){
                                console.log('Stopped import')
                                break
                            }

                            this.progressDisplayComp.progressText = `Importing ${folderName} into your database...`
                            const isFinalFallback = isLastBatch && folderName === fallbackFolders.at(-1)
                            const fallbackResponse = await safeImportRequest(buildImportRequest([folderName], isFinalFallback, shouldUpdateMbrThisBatch))
                            if(!isTransportFailureResponse(fallbackResponse) && fallbackResponse.status){
                                markFolderSuccess(folderName)
                            }
                            else{
                                const fallbackError = fallbackResponse?.errormessage ?? response.errormessage
                                markFolderFailure(folderName, fallbackError)
                                if(isTransportFailureResponse(fallbackResponse)){
                                    const remainingFallbackFolders = fallbackFolders.slice(fallbackIndex + 1)
                                    for(const pendingFallbackFolder of remainingFallbackFolders){
                                        markFolderFailure(
                                            pendingFallbackFolder,
                                            `${transportStopMessage} Re-run import after the server connection is restored.`
                                        )
                                    }

                                    const remainingGlobalFolders = subfolders.slice(batchStart + batchSubfolders.length)
                                    for(const pendingGlobalFolder of remainingGlobalFolders){
                                        markFolderFailure(
                                            pendingGlobalFolder,
                                            `${transportStopMessage} Re-run import after the server connection is restored.`
                                        )
                                    }

                                    stopProgress = true
                                    this.progressDisplayComp.populateErrorMessage(`${transportStopMessage} Imported folders already completed were preserved.`)
                                    break
                                }
                                if(isLockMessage(fallbackError)){
                                    batchHadLockFailure = true
                                    await waitForDelay(200)
                                }
                            }
                        }
                    }
                }

                updateAdaptiveBatchSize(batchElapsedMs, this.successCounter + this.failedCounter - completedBeforeFallback, batchHadFailure, batchHadLockFailure)
                batchStart += batchSubfolders.length
            }
            //hack for homePageContainer to show after import
            $("#selectDatabasePage, #homePageContainer").toggle();
            await selectDatabase(this.databasePath.slice(0, (-this.databaseName.length - 1)), this.databasePath)
            //Navigate the table view to default to the database table
            document.getElementById("databaseNavLink").click()
    
            if(doGenerateRasters && !stopProgress && this.failedCounter == 0 && !this.isTabularOnly) { 
                const rootPath = this.databasePath.match(/^(.*[\\/])/)[1].replace(/\/$/, '')
                this.progressDisplayComp._hideStopButton = true
                // //Default resolution is 10m, 30m for SSURGO template databases that have 300+ imports
                // //Need to change test because user might add 1 SSA to a .gpkg that already has 1000, but resolution would be 10m.
    
                this.progressDisplayComp.progressText = `Generating raster for ${this.databaseName}.<br>Elapsed Time will stop when process is complete.`;
    
                let overrideGridSizeValue = parseInt(document.getElementById("override-grid-size-input").value)
                let resolution = 10
                if (overrideGridSizeValue) {
                    resolution = overrideGridSizeValue
                } else if (this.successCounter > 300) {
                    // have to revisit this successCounter conditional check 
                    resolution = 30
                }
                let request = {
                    'request': generateRastersRequest, 'database': this.databasePath, 'root' : rootPath, 'rasterresolution' : resolution, 'buildpyramids' : true, 'generateRAT' : true, 'calculatestats' : true, 'deleteexistingrasters' : false
                }
                let response = await sendRequest(request)
                //Response is good
                if (response && response.status){    
                    this.progressDisplayComp.progressTitle = "Imported data";
                    this.progressDisplayComp.progressText = "Listed folders successfully imported. Raster successfully generated.";
                    this.progressDisplayComp.progressCounterMessage = `Raster and auxiliary files created in:<br>${rootPath}.`;   
    
                }
                //If the import response has a status of false
                else{
                    success = false;
                    this.progressDisplayComp.progressTitle = "Raster creation failed.";
                    this.progressDisplayComp.progressText = "Raster creation failed, however the listed folders have successfully been imported.";
                    this.progressDisplayComp.progressCounterMessage = "";    
                    this.progressDisplayComp.populateErrorMessage(`<b>Error Message:</b> ${response?.errormessage ? response.errormessage : 
                        "An unknown error occured while trying to generate the raster."}`);          
    
                }
                this.progressDisplayComp.stop(successfulFolders, failedFolders, action, success);
            }
            else{
    
                if(Object.keys(failedFolders).length == subfolders.length){
                    this.progressDisplayComp.progressTitle = "Failed to import all selected areas";
                    this.progressDisplayComp.progressText = "An error occured while importing the selected areas";               
    
                }
                else{
                    this.progressDisplayComp.progressTitle = "Successfully imported SSURGO Data";
                    this.progressDisplayComp.progressText = "Successfully imported selected SSURGO Data";                    
    
                }
    
                this.progressDisplayComp.stop(successfulFolders, failedFolders, action, success);
    
            }
        }
        }
        finally{
            this.importInProgress = false
        }
    }

    setupListeners(){
        const deleteBtn = document.getElementById("deleteBtn")
        if (deleteBtn){
            if(!this.deleteClickHandler){
                this.deleteClickHandler = ()=>{
                    this.deleteCandidates()
                }
            }
            deleteBtn.removeEventListener("click", this.deleteClickHandler)
            deleteBtn.addEventListener("click", this.deleteClickHandler)
        }

        const importBtn = document.getElementById("importBtn")
        if (importBtn){
            if(!this.importClickHandler){
                this.importClickHandler = ()=>{
                    this.importCandidates()
                }
            }
            importBtn.removeEventListener("click", this.importClickHandler)
            importBtn.addEventListener("click", this.importClickHandler)
        }
    }

}