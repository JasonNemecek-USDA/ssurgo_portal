import apiServiceDef from "/static/services/apiService.mjs";
import pLimit from "/static/JsLibrary/pLimit/p-limit-index.js"
var WSS_DOWNLOAD_URL
var SDA_URL
const UPLOAD_URL = "http://localhost:8083/uploadBlob";
const UNZIP_URL = "http://localhost:8083/uncompress";
let cancel_download = false;
let controller = new AbortController();
let signal = controller.signal
let unfinishedAreasymbols = []
let downloadFolder
const apiService = new apiServiceDef();

onmessage = async (event) => {

    console.log("Received message from the main thread: ", event.data);

    const data = event.data;

    if(data.command === 'download'){
        cancel_download = false;
        const dest = data.destination;
        downloadFolder = dest
        const overwrite = data.overwrite;
        const areaSymbols = data.areaSymbols;
        await downloadSurveyAreas(areaSymbols, dest, overwrite);
        if(cancel_download){
            postMessage({name: "download-cancelled"});
        }            
        else{
            postMessage({name: "download-complete"});
        }
            
    }
    else if(data.command === "return-urls"){
        WSS_DOWNLOAD_URL = data.urls.wssDownloadUrl;
        SDA_URL = data.urls.sdaPostRestUrl;
        postMessage({name: 'urls-set'});
    }
    else if(data.command === 'stop-download'){
        cancel_download = true;
        controller.abort()
        //Define a new abort controller and signal.
        controller = new AbortController()
        signal = controller.signal

        //If we have any unfinished downloads, delete the files to prevent uncomplete data from being used by the user. 
        if(unfinishedAreasymbols.length != 0){
            await fetch(
                "http://localhost:8083/SSURGOPortalUI", {
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

        postMessage({name: "download-cancelled"});
    }

    const result = "message received;";
    postMessage({name: 'message-received', message: result});

}

/**
 * This function retrieves the download URLs for the given area symbols. It first creates a temporary table with the area symbols, then queries the SDA to get the WKT for each area symbol. Finally, it queries the SASTATUSMAP to get the save/rest date for each area symbol and constructs the download URLs.
 * @param {[string]} areaSymbols - The area symbols to get the download URLs for.
 * @returns {Promise<[Object]>} - A promise that resolves to an array of objects containing the area symbol, area name, and file name for each area symbol.
 */
async function getDownloadUrls(areaSymbols){
    let sqlQuery = `~DeclareVarchar255Table(@maTable)~;Insert into @maTable (s) values ${areaSymbols.map(value => `('${value}')`).join(', ')};SELECT * FROM SDA_Get_AreasymbolWktWgs84_from_AreasymbolTable(@maTable);`;
    //next query 
    sqlQuery = 
    `SELECT AREASYMBOL, AREANAME, CONVERT(varchar(10), [SAVEREST], 126) AS SAVEREST FROM SASTATUSMAP WHERE AREASYMBOL IN (${areaSymbols.map(s => `'${s}'`).join(',')}) ORDER BY AREASYMBOL;`;

    const jsonObj = await apiService.post(SDA_URL, {'format': 'JSON', 'query': sqlQuery});

    //const jsonObj = JSON.parse(data);
    const sastatusmap_records = jsonObj.Table;

    //print urls to download
    return sastatusmap_records.map(rec => {return {areaSymbol: rec[0], areaName: rec[1], fileName: `wss_SSA_${rec[0]}_[${rec[2]}].zip`}})
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
    }
    /**
     * Reads the zip file from WSS as a blob. This function is necessary because some of the zip files are too large to be read into memory all at once, so we need to use a stream reader to read the file in chunks.
     * @returns 
     */
    async readLargeFile() {
        const url = `${WSS_DOWNLOAD_URL}${this.fileName}`
        try{
            const reader = await apiService.getReader(url, signal);
            const stream = new ReadableStream({
                start(controller) {
                    function push() {
                        reader.read().then(({ done, value }) => {
                            if(cancel_download){
                                reader.cancel('No longer needed').then(()=>console.log('Stream cancelled.'))
                            }
                            if (done) {
                                controller.close();
                                return;
                            }
                            controller.enqueue(value);
                            push();
                        }).catch(error => {
                            if(error.name !="AbortError"){
                                console.error('Stream reading error:', error);
                                controller.error(error);
                                Promise.resolve({name: "download-status", file: this.fileName, success: false})
                            }
                        });
                    }
                    push();
                }
            });
            const newResponse = new Response(stream);
            this.blob = await newResponse.blob();
        }
        catch(error){
            if(error.name == "AbortError"){
                return Promise.reject("User cancelled")
            }
        }
    }
    /**
     * Saves the zipfile from WSS to the local machine by calling the local node server. The node server will save the file and return a success message, but it will not unzip the file. This is because we want to keep the full pipeline of download -> save -> unzip in one function, so that if the user cancels in the middle of the pipeline, we can stop the entire process and prevent incomplete data from being saved or unzipped on the users machine.
     * @param {*} destination 
     * @param {*} overwrite 
     * @returns 
     */
    async saveZipFile(destination, overwrite, reportFailure = true){
        let params = [];
        params.push({name: 'file', value: this.blob, fileName: this.fileName});
        params.push({name: 'filename', value: this.fileName});
        params.push({name: 'location', value: destination});
        params.push({name: 'overwrite', value: overwrite ? '1' : '0'});

        return await apiService.postFormData(UPLOAD_URL, params, signal)
            .then(response => {
                if(response.success){
                    console.log("file transferred successfuly");
                    return true;
                }else if(response.aborted){
                    console.log("file transfer aborted");
                    return false;
                }else{
                    console.log("file unzip failed");
                    if(reportFailure){
                        postMessage({name: "download-status", file: this, success: false});
                    }
                    return false;
                }
            }
            ).catch((error) => {
                if(error.name !="AbortError"){
                    console.error('Save file error:', error);
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

        return await apiService.postFormData(UNZIP_URL, params, signal)
            .then(response => {
                if(response.success){
                    console.log("file transferred successfuly");
                    unfinishedAreasymbols = unfinishedAreasymbols.filter(area => area !== this.areaSymbol)
                    postMessage({name: "download-status", file: this, success: true});
                    return true;
                }else if(response.aborted){
                    console.log("file unzip aborted");
                    return false;
                }else{
                    console.log("file unzip failed");
                    if(reportFailure){
                        postMessage({name: "download-status", file: this, success: false});
                    }
                    return false;
                }
            }
            ).catch((error) => {
                if(error.name !="AbortError"){
                    console.error('Save file error:', error);
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
    const maxConcurrentRequests = 15
    const limit = pLimit({concurrency: maxConcurrentRequests, rejectOnClear: true})
    const throwIfCancelled = () => {
        if(cancel_download){
            limit.clearQueue()
            throw AbortSignal.abort().reason
        }
    }

    unfinishedAreasymbols = areaSymbols
    const runBatch = async (downloadFiles, reportFailure) => {
        const retryFiles = []
        const areaPipelines = downloadFiles.map(file => limit(async () => {
            const fileObj = new AreaZipFile(file.areaSymbol, file.areaName, file.fileName)
            try{
                // Keep the full pipeline in one limited slot: download -> save -> unzip.
                throwIfCancelled()
                await fileObj.readLargeFile()
                throwIfCancelled()

                const saved = await fileObj.saveZipFile(destination, overwrite, reportFailure)
                throwIfCancelled()
                if(!saved){
                    if(!reportFailure){
                        console.error("Download failed for file ", file.fileName, " with error: ", error.message, " Adding to retry list.")
                        retryFiles.push(file)
                    }
                    return
                }

                const unzipped = await fileObj.unzipAreaSymbol(destination, overwrite, reportFailure)
                if(!unzipped && !reportFailure){
                    console.error("Download failed for file ", file.fileName, " with error: ", error.message, " Adding to retry list.")
                    retryFiles.push(file)
                }
            }
            catch(error){
                if(cancel_download || error?.name === "AbortError"){
                    return
                }

                console.log("An error has occured", error.message)
                if(reportFailure){
                    postMessage({name: "download-status", file: fileObj, success: false})
                }else{
                    console.error("Download failed for file ", file.fileName, " with error: ", error.message, " Adding to retry list.")
                    retryFiles.push(file)
                }
            }
        }))

        await Promise.allSettled(areaPipelines)
        return retryFiles
    }

    try{
        throwIfCancelled()
        const downloadUrls = await getDownloadUrls(areaSymbols)
        throwIfCancelled()

        const retryUrls = await runBatch(downloadUrls, false)
        throwIfCancelled()

        if(retryUrls.length > 0){
            await runBatch(retryUrls, true)
        }
    }
    catch(error){
        if(cancel_download || error?.name === "AbortError"){
            limit.clearQueue()
            return
        }

        throw error
    }
}

export {AreaZipFile, getDownloadUrls, downloadSurveyAreas};