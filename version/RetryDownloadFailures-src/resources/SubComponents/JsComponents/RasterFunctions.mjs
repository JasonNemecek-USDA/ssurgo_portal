import BrowserStorageFunctions from "./BrowserStorageFunctions.mjs"
import {generateRastersRequest, getFolderTreeRequest} from "./Constants.mjs"
import { sendRequest } from "./GeneralHelpers.mjs"
export default class RasterFunctions{
    static databaseData = null
    static fullDatabasePath = null
    static databasePath = null
    static databaseName = null

    static checkGridSizeInput(inputFieldId, validationTextId) {
        //Check if Override Grid Size input is > 0m 
        let overrideValue = document.getElementById(inputFieldId).value
        let invalidTextOverrideGridSize = document.getElementById(validationTextId)

        let regex = /^\d+$/
        let isPositiveInt = regex.test(overrideValue)
        let isValidInput
        
        if(overrideValue && (overrideValue == 0 || !isPositiveInt)) {
            invalidTextOverrideGridSize.style.display = 'block'
            isValidInput = false
        } else {
            invalidTextOverrideGridSize.style.display = 'none'
            isValidInput = true
        }

        return isValidInput
    }

/** Send request to the python server to check for num of tif files (how many rasters are generated?).*/
    static async getRasters() {
        let validationText = document.getElementById("generateRasterValidationText")
        if (validationText.style.display == "block") {
            // exit function and do not generate rasters since input is not valid 
            return
        } 

        //let limitnavigationdepth
        const maxdepth = 0
        const showFiles = true
        RasterFunctions.databasePath = BrowserStorageFunctions.getLocalStorage("getdatabaseinventory")

        let data = {'request': getFolderTreeRequest, 'path': RasterFunctions.databasePath, 'folderpattern' : ".*.tif", 'ignorefoldercase': true,
            'filepattern' : ".*.tif", 'ignorefilecase': true, 'showfiles': showFiles, 'maxdepth': maxdepth}
        let rasterFiles = await sendRequest(data)

        if (rasterFiles.nodes && rasterFiles.nodes.length > 0) {
            // if there are any raster files that already exist, display warning modal to user 
            document.getElementById('existingRasterBtn').click()
            let modalBody = document.getElementById("existingRasterModalMessage")
            modalBody.innerHTML = "You're creating a new raster in a folder where the following raster files already exist: "
            let existingRasterList = document.createElement('ul')
            modalBody.appendChild(existingRasterList)
            for(let node of rasterFiles.nodes){
                let existingRasterListItem = document.createElement('li')
                existingRasterListItem.innerHTML = `${node.name}` 
                existingRasterList.appendChild(existingRasterListItem)
            }

            document.getElementById("continueGenerateRaster").onclick = function() {
                RasterFunctions.generateRasterFiles(rasterFiles)
            }
            
        } else {
            // user has no existing raster files in their DB folder -> continue with raster generation flow 
            RasterFunctions.generateRasterFiles()
        }
    }

    static async generateRasterFiles(rasterFiles = {}) {
        let stopProgress = false;
        const subfolders = RasterFunctions.databaseData;
        let success = true;
        let action = "import"

        let progressDisplayComp = document.getElementById("progressdisplay");
            progressDisplayComp.removeEventListener("onStopAction", e => {stopProgress=true});
            progressDisplayComp.addEventListener("onStopAction", e => {stopProgress=true});
            progressDisplayComp.progressTitle = "Generating rasters...";
            progressDisplayComp.progressCounterMessage = `Generating raster files.`;
            progressDisplayComp.progressScreenSetup(subfolders, action); 
            progressDisplayComp._hideStopButton = true
        let progressBarContainer = document.getElementById("progressBarSuccessContainerId")
        Object.assign(progressBarContainer, {
            style: "display: none",
        })

        let successfulFolders = []
        let failedFolders = []
        let successCounter = 0
        let loadingSpinner = document.getElementById("loadingSpinnerContainerId")
        let doneLoadingCheckmark = document.getElementById("doneLoadingImgId")
        let failedLoadingX = document.getElementById("failedLoadingImgId")

        if(!stopProgress) { 
            Object.assign(loadingSpinner, {
                style: "display: block",
            })
            Object.assign(doneLoadingCheckmark, {
                style: "display: none",
            })
            Object.assign(failedLoadingX, {
                style: "display: none",
            })

            //const rootPath = RasterFunctions.databasePath.match(/^(.*[\\/])/)[1].replace(/\/$/, '')
            // //Hide button until raster generation is completed.
            // progressDisplay.stopProgressButton.setAttribute("style", "display:none;")
            // //Default resolution is 10m, 30m for SSURGO template databases that have 300+ imports
            // //Need to change test because user might add 1 SSA to a .gpkg that already has 1000, but resolution would be 10m.

            progressDisplayComp.progressText = `Generating raster for ${RasterFunctions.databaseName}.<br>Elapsed Time will stop when process is complete.`;

            const overrideGridSizeValue = parseInt(document.getElementById("override-grid-size-input-db").value)
            let resolution = 10
            if (overrideGridSizeValue) {
                resolution = overrideGridSizeValue
            } else if (successCounter > 300) {
                // have to revisit this successCounter conditional check 
                resolution = 30
            }
            
            const request = {
                'request': generateRastersRequest, 'database': RasterFunctions.fullDatabasePath, 'root' : RasterFunctions.databasePath, 'rasterresolution' : resolution, 'buildpyramids' : true, 'generateRAT' : true, 'calculatestats' : true, 'deleteexistingrasters' : true
            }
            const response = await sendRequest(request)
            //const response = await sendData(request)
            //Response is good
            if (response && response.status){
                progressDisplayComp.progressTitle = "Rasters generated";
                progressDisplayComp.progressText = "Raster successfully generated.";
                progressDisplayComp.progressCounterMessage = `Raster and auxiliary files created in:<br>${RasterFunctions.databasePath}.`; 
                
                Object.assign(loadingSpinner, {
                    style: "display: none",
                })
                Object.assign(doneLoadingCheckmark, {
                    style: "display: block",
                })
                Object.assign(failedLoadingX, {
                    style: "display: none",
                })
            }
            //If the import response has a status of false or the response does not return a value.
            else{
                success = false;
                action = "delete"
                //Not tested prior to 8/30/2024 "demo" version
                const errorMessage = response && response.errormessage ? encodeURIComponent(response.errormessage.replaceAll("(", "%28").replaceAll(")", "%29").replaceAll(":", " "))
                    : "no%20response%20generating%20raster%20file"
                fetch('http://localhost:8083/tlogger/warning:'+ errorMessage)

                progressDisplayComp.progressTitle = "Raster creation failed.";
                progressDisplayComp.progressText = "Rasters failed to be generated.";
                progressDisplayComp.progressCounterMessage = "";    

                Object.assign(loadingSpinner, {
                    style: "display: none",
                })
                Object.assign(doneLoadingCheckmark, {
                    style: "display: none",
                })
                Object.assign(failedLoadingX, {
                    style: "display: block",
                })
            }
            progressDisplayComp.stop(successfulFolders, failedFolders, action, success);
        }
    }
    static setupListeners(){
        const overrideGridSizeInput = document.getElementById("override-grid-size-input")
        if (overrideGridSizeInput){
            overrideGridSizeInput.addEventListener("keyup", ()=>{
                RasterFunctions.checkGridSizeInput("override-grid-size-input", "validationTextOverrideGridSize")
            })
        }

        const overrideGridSizeInputDb = document.getElementById("override-grid-size-input-db")
        if (overrideGridSizeInputDb){
            overrideGridSizeInputDb.addEventListener("keyup", ()=>{
                RasterFunctions.checkGridSizeInput('override-grid-size-input-db', 'generateRasterValidationText')
            })
        }

        const generateRasterBtn = document.getElementById("generateRasterBtn")
        if (generateRasterBtn){
            generateRasterBtn.addEventListener("click", ()=>{
                RasterFunctions.getRasters()
            })
        }
    }
}