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
    }

    async deleteCandidates(){
        //set values
        let stopProgress = false
        const subfolders = this.databaseTable.selectedCheckboxes
        const action = "delete";
        const continueDelete = await deleteDatabaseWarning()
        if(!continueDelete){
            return
        }
        this.progressDisplayComp.removeEventListener("onStopAction", e => {stopProgress=true});
        this.progressDisplayComp.addEventListener("onStopAction", e => {stopProgress=true});

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

    async importCandidates(skipPretest = true,  loadInSpatialOrder = false, loadspatialdatawithinsubprocess = false, isDissolve = true, includeSubRules = false){
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
    
            this.progressDisplayComp.removeEventListener("onStopAction", e => {stopProgress=true});
            this.progressDisplayComp.addEventListener("onStopAction", e => {stopProgress=true});
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
            for(let folder in subfolders){
                /*Stop button has a function. This function sets a global variable that will need to be reset at the end of the cancelation*/
                if(!stopProgress){
                    if(
                        //If not generating rasters OR performing the last import, hide the stop button
                        (folder == subfolders.length -1 && !doGenerateRasters) || 
                        (folder == subfolders.length && doGenerateRasters)
                    ){
                        this.progressDisplayComp._hideStopButton = true
                    }
                    this.progressDisplayComp.progressText = `Importing ${subfolders[folder]} into your database...`;                
                    let request = {
                        'request': importCandidatesRequest, 'database': this.databasePath, 'root' : this.folderPath, 'skippretest': skipPretest, 'istabularonly': this.isTabularOnly, 'loadinspatialorder' : loadInSpatialOrder,
                        'loadspatialdatawithinsubprocess' : loadspatialdatawithinsubprocess, 'dissolvemupolygon' : isDissolve, 'subfolders' : [subfolders[folder]], 'includeinterpretationsubrules' : includeSubRules
                    }
                    let response = await sendRequest(request)
                    if(!response){
                        const errorfolder = subfolders[folder].replaceAll(" ", "%20")
                        fetch("http://localhost:8083/tlogger/warning:empty%20response%20for%20import%20candidates%20"+errorfolder)
                        continue
                    }
                    //Response is good
                    if (response.status){
                        successfulFolders.push(subfolders[folder])
    
                        this.progressDisplayComp.successValue++;                         
                        this.progressDisplayComp.progressCounterMessage = `${this.progressDisplayComp.successValue} out of ${subfolders.length} imports loaded. ${this.failedCounter} imports failed.`;                    
    
                    }
                    //If the import response has a status of false
                    else{
                        let errorData = {"areaname": subfolders[folder], "errormessage": response.errormessage}
                        failedFolders.push(errorData)
    
                        this.progressDisplayComp.failValue++;                     
                        this.progressDisplayComp.progressCounterMessage = `${this.progressDisplayComp.successValue} out of ${subfolders.length} imports loaded. ${this.progressDisplayComp.failValue} imports failed.`;                           
                        this.progressDisplayComp.populateErrorMessage(`${subfolders[folder]} Error Message: ${response.errormessage}`);      
                    }
                }
                //Import process stopped
                else{
                    echo('Stopped import')
                    break
                }
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
                    //Not tested prior to 8/30/2024 "demo" version
                    if(response){
                        fetch('http://localhost:8083/tlogger/warning:'+response['errormessage'])
                    }
                    else{
                        fetch('http://localhost:8083/tlogger/warning:empty%20response%20for%20raster%20generation')
                    }    
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

    setupListeners(){
        document.getElementById("deleteBtn").addEventListener("click", ()=>{
            this.deleteCandidates()
        })
        document.getElementById("importBtn").addEventListener("click", ()=>{
            this.importCandidates()
        })
    }

}