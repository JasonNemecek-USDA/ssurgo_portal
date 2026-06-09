let DownloaderFunctions = null
let BrowserStorage = null
let SDA_POSTREST_URL = null
let osPathSep = null
let RasterFunctions = null
let DatabaseFunctions = null
let moduleInitPromise = null
async function initializeModules(){
    if (moduleInitPromise) {
        return moduleInitPromise
    }

    moduleInitPromise = (async () => {
        try{
            BrowserStorage = (await import("/static/SubComponents/JsComponents/BrowserStorageFunctions.mjs")).default
            SDA_POSTREST_URL =  BrowserStorage.getUrlCookie("sdaPostRestUrl")
            osPathSep = BrowserStorage.getOsPathSep()

            if (!DownloaderFunctions) {
                const myDownloaderFunctions = (await import("/static/SubComponents/JsComponents/DownloaderFunctions.mjs")).default
                DownloaderFunctions = new myDownloaderFunctions(SDA_POSTREST_URL)
            }

            if (!RasterFunctions) {
                RasterFunctions = (await import("/static/SubComponents/JsComponents/RasterFunctions.mjs")).default
            }

            if (!DatabaseFunctions) {
                const myDatabaseFunctions = (await import("/static/SubComponents/JsComponents/DatabaseFunctions.mjs")).default
                DatabaseFunctions = new myDatabaseFunctions()
            }
        }
        catch(error){
            moduleInitPromise = null
            echo("Failed to load DownloaderFunctions: " + error)
            throw error
        }
    })()

    return moduleInitPromise
}
//Feature flags
const showSdvResultsFlag = false;
const enableShapefileDownload = false;
const enableSsaVersionCheck = true;

const url = '/SSURGOPortalUI'
const fileCheckUrl = '/fileExists'
//Database Inventory Table Constants
const dbTableId = 'databaseTable'
const dbTableContainer = 'dbTableContainer'
const dbTableCaption = 'SSURGO Data in Database Table'
//Name of columns and their onclick events
const dbTableHeaders = {
    'Area Symbol' : ["sortTable(1, 'databaseTableBody', true, 'text')", "Area Symbol of SSURGO in database"],
    'Area Name' : ["sortTable(2, 'databaseTableBody', true, 'text')", "Area Name of SSURGO in database"],
    'SSURGO Version Date' : ["sortTable(3, 'databaseTableBody',true, 'date')", "Version date for \r SSURGO data \r in database"],
    'Tabular Only' : ["sortTable(4, 'databaseTableBody', true, 'tabularOnly')", "Indicates \r that only \r tabular data \r exists for \r area symbol"]
}
//SSA Inventory Table Constants
const importTableId = 'importTable'
const importTableContainer = 'importTableContainer'
const importTableCaption = 'Import SSURGO Data'

//Name of columns and their onclick events
const importTableHeaders = {
    'Folder Name' : [`sortTable(1, '${importTableId}', true, 'text', 'tbody')`, "Name of folder containing SSURGO data"],
    'Area Symbol' : [`sortTable(2, '${importTableId}', true, 'text', 'tbody')`, "Area Symbol of SSURGO in the folder"],
    'Area Name' : [`sortTable(3, '${importTableId}', true, 'text', 'tbody')`, "Area Name of SSURGO in the folder"],
    'Folder SSURGO Version Date' : [`sortTable(4, '${importTableId}', true, 'date', 'tbody')`, "Version date of SSURGO data in folder"],
    'Exists in Database' : [`sortTable(5, '${importTableId}', true, 'versionCheck', 'tbody')`, "Indicates SSURGO area \r symbol in folder already \r exists in database"],
    'Database SSURGO Version Date' : [`sortTable(6, '${importTableId}', true, 'date', 'tbody')`, "Version date \r for SSURGO \r data in \r database"]
}
//Constants to determine which part of the page is being populated by the folder tree
    //If modified the html will also have to follow suit in places where correlated javascript methods are called I.E. executeFolderTreeRequest and initializeTreeView
const openDatabaseLocation = 'openDatabaseLocation'
const databaseTreeViewTableId = 'databaseTreeViewTable'
const databaseTreeViewTableCaption = 'Select or Create a Database'
const importTreeViewTableId = 'importTreeViewTable'
const importTreeViewTableCaption = 'Select Folder of SSURGO Data'
const downloadTreeViewTableId = 'downloadTreeViewTable'
const downloadTreeViewTableCaption = 'Select Download Folder for SSURGO Data'
const ssaFolderLocation = 'ssaFolderLocation'
//Name of columns and their onclick events
const databaseTreeViewHeaders = {
    'Name' : "doubleSort(0, 'databaseTreeViewTableFolderSection', 'databaseTreeViewTableFileSection', 'text')",
    'Date modified' : "doubleSort(1, 'databaseTreeViewTableFolderSection', 'databaseTreeViewTableFileSection', 'date')",
    'Type' : "sortTable(2, 'databaseTreeViewTableFileSection', false, 'text')",
    'Size' : "sortTable(3, 'databaseTreeViewTableFileSection', false, 'fileSize')"}

const ssurgoTreeViewHeaders = {
    'Name' : "sortTable(0, 'importTreeViewTableFolderSection', false, 'text')",
    'Date modified' : "sortTable(1, 'importTreeViewTableFolderSection', false, 'date')"
}

const downloadTreeViewHeaders = {
    'Name' : "sortTable(0, 'downloadTreeViewTableFolderSection', false, 'text')",
    'Date modified' : "sortTable(1, 'downloadTreeViewTableFolderSection', false, 'date')"
}
const ratingTableHeaders = {
    'Area Symbol' :             "sortRating('areasymbol')"//[`sortTable(0, 'ratingTbody', false, 'text')`]// , 'Sort Area Symbol'
    ,'Map Unit Symbol' :        [`sortTable(1, 'ratingTbody', false, 'text')`]// , 'Sort Map Unit Symbol'
    ,'Map Unit Name' :          [`sortTable(2, 'ratingTbody', false, 'text')`]// , 'Sort Map Unit Name'
    ,'Rating' :                 "sortRating('rating')"//[`sortTable(3, 'ratingTbody', false, 'text')`]// , 'Sort Rating' //Need to configure logic for setting the rating sorting.
    ,'Percent of Map Unit' :    [`sortTable(4, 'ratingTbody', false, 'fileSize')`]// , 'Sort Percent of Map Unit'
}
//Constants for requests going to Data Loader
const databaseTableRequest = 'getdatabaseinventory'
const createTemplateDatabaseRequest = 'createTemplateDatabase'
const copyTemplateFileRequest = 'copytemplatefile'
const deleteAreaSymbolRequest = 'deleteareasymbols'
const getFolderTreeRequest = 'getfoldertree'
const pretestImportCandidatesRequest = 'pretestimportcandidates'
const importCandidatesRequest = 'importcandidates'
const generateRastersRequest = 'generaterasters'
const getTemplateCatalogRequest = 'gettemplatecatalog'
const getSDVAttributesByFolderRequest = 'getsdvattributesbyfolder'
const getSDVRatingOptions = 'getsdvratingoptions'
const generateAggregationRequest = 'generateaggregation'
const bulkSSADownload = 'bulkssadownload'


//Variables for paths
var databasePath
var folderPath
var databaseName
var requestLocation
var emptyTemplates // holds the emptyTemplates Object from the config.py file
//Variables for flags
var stopProgress = false
var rootPath
var overwriteChecked = false
var duplicateSSAs = {}
var aggregationRuleResponse

function setDatabaseNameAndPath(name, path, databasefunctions = DatabaseFunctions, rasterfunctions = RasterFunctions){
    databasefunctions.databasePath = path
    rasterfunctions.fullDatabasePath = path
    databasefunctions.databaseName = name
    databasefunctions.folderPath = folderPath
    rasterfunctions.databaseName = name
}

function sendLoggerWarning(message){
    const encodedMessage = encodeURIComponent(String(message ?? 'Unknown warning'))
    return fetch(`/tlogger/warning:${encodedMessage}`).catch(() => {})
}
/**Main function for communicating with the server*/
async function sendData(data){
    //first we send the data for the server and wait
    let request = data?.request
    let returnedResponse
    const requestTag = String(request ?? 'unknown-request')
    //Without a timeout set in code, browsers will enforce their own server request timeouts (bahavoir isn't consistent, though)
    //This code sets a timeout limit that is hopefully larger than what any process may need to complete.
    const controller = new AbortController();
    const timeoutID = setTimeout(() => controller.abort(), 200000000); //in milliseconds (~55.5 hours)

    try {
        const response = await fetch(url, {
            method : 'POST',
            headers: {'Content-Type' : 'application/json'},
            body: JSON.stringify(data),
            signal: controller.signal
        })

        if(!response.ok){
            throw new Error(`HTTP error! status: ${response.status}`)
        }

        const responseData = await response.json()

        try{
            //This can probably be separated into a separate method
            if(request == databaseTableRequest){
                databaseTable.totalRows = Object.keys(responseData.records).length
                databaseTable.data = responseData.records
                databaseTable.dbStatus = responseData.dbstatus
                DatabaseFunctions.databaseTable = databaseTable
                RasterFunctions.databaseData = databaseTable.data
                setDatabaseName(databasePath)
                setDatabaseNameAndPath(databaseName, databasePath)
                buildDatabaseTable()
                document.getElementById('emptyDatabaseGrayIcon').setAttribute('style', 'display: none')
                Object.keys(responseData.records).length > 0 ? 
                    $("#importPromptMessage").text("To import more data into your database, please choose one of the options below.") :
                    $("#importPromptMessage").text("We have detected that you have selected an empty database. Please choose one of the options below to add data to your database.");
                
                //if Feature Flag is enabled, then check if data is stale
                if (enableSsaVersionCheck) {
                    databaseTable.displaySsaDiscrepencyNotifications()
                }
            }
            else if(request == pretestImportCandidatesRequest){
                getTotalFolders(responseData.subfolders)
                setErrorToggleDisplay()
                importTable.data = responseData.subfolders
                if (DatabaseFunctions) {
                    DatabaseFunctions.importTable = importTable 
                    DatabaseFunctions.folderPath = folderPath
                }
                buildImportTable()
                setFolderName(folderPath)
                if(importTable.errorFolders > 0){
                    document.getElementById('toggleErrorDiv').removeAttribute('style')
                }
                else{
                    document.getElementById('toggleErrorDiv').setAttribute('style', 'display: none')
                }
                if(Object.keys(duplicateSSAs).length > 0){
                    document.getElementById('toggleDuplicateDiv').removeAttribute('style')
                }
                else{
                    document.getElementById('toggleDuplicateDiv').setAttribute('style', 'display: none')
                }
                setDuplicateToggleDisplay()
            }
            else if(request == createTemplateDatabaseRequest){
                databasePath = responseData.path
                promptUsersToImport()
            }
            else if(request == copyTemplateFileRequest){
                returnedResponse = responseData
                //Update the database tree view when creating a new database    
                executeFolderTreeRequest(databaseTreeViewTable.tableId, rootPath, true)
            }
            else if(request == importCandidatesRequest){
                returnedResponse = responseData
            }
            else if(request == generateRastersRequest){
                returnedResponse = responseData
            }
            else if(request == deleteAreaSymbolRequest){
                returnedResponse = responseData
            }
            else if(request == bulkSSADownload){
                returnedResponse = responseData
            }
            else if (request == getTemplateCatalogRequest){
                emptyTemplates = responseData.emptytemplates
            }
            else if (request == getSDVAttributesByFolderRequest) {
                returnedResponse = responseData
            }
            else if (request == getSDVRatingOptions) {
                returnedResponse = responseData
            }
            else if (request == generateAggregationRequest){
                returnedResponse = responseData
            }
            else if (request == getFolderTreeRequest){
                if(requestLocation == databaseTreeViewTableId){
                    //Builds out the tree view for selecting a database
                    let search = document.getElementById("databaseSearchText")
                    search.setAttribute('onchange', `executeFolderTreeRequest('${databaseTreeViewTable.tableId}', "${rootPath}", true, updatedValue('databaseSearchText'))`)
                    databaseTreeViewTable.data = responseData.nodes
                    databaseTreeViewTable.populateTreeViewTable()
                }
                else if(requestLocation == importTreeViewTableId){
                    //Builds out the tree view to select an SSA parent folder
                    let search = document.getElementById("ssaSearchTextbox") //Set the id of the search bar.
                    search.setAttribute('onchange', `executeFolderTreeRequest('${importTreeViewTable.tableId}', "${rootPath}", false, updatedValue('ssaSearchTextbox'))`)
                    importTreeViewTable.data = responseData.nodes
                    importTreeViewTable.populateTreeViewTable()
                    importTreeViewTable.treeViewContainsSsurgo("hasSsurgoDataMessage")
                    $("#selectSsurgoFolderFinalizeBtn").on("click", () => {ImportActivities.selectSSAParentFolder(rootPath)})
                }
                else if(requestLocation == downloadTreeViewTableId){
                    //Builds out the tree view to select a download folder
                    let search = document.getElementById("downloadSearchTextbox") //Set the id of the search bar.
                    search.setAttribute('onchange', `executeFolderTreeRequest('${downloadTreeViewTable.tableId}', "${rootPath}", false, updatedValue('downloadSearchTextbox'))`)
                    downloadTreeViewTable.data = responseData.nodes
                    downloadTreeViewTable.populateTreeViewTable()
                    downloadTreeViewTable.treeViewContainsSsurgo("hasSsurgoDataMessage")
                }
            }
            else if (request == 'getstatus'){
                echo(responseData)
            }
            else(
                console.log("Unknown request: " + responseData.request.request)
            )
        }
        catch(error){
            echo(error)
            logJavaScriptError(error?.stack ?? String(error))
        }

        //If we are expecting to return an item, return it.
        if(returnedResponse != null){
            return(returnedResponse)
        }

        return responseData
    }
    catch(err){
        if (err?.name === 'AbortError') {
            sendLoggerWarning(`sendData timed out for ${requestTag}`)
        }
        else{
            const warningMessage = String(err?.message ?? err)
            sendLoggerWarning(`sendData failed for ${requestTag} - ${warningMessage}`)
        }
        //The message in the Modal below only covers one error scenario. Other error Modals are needed.
        $('#serverClosedModal').modal("show")
        return null
    }
    finally{
        clearTimeout(timeoutID)
    }
}


/**Send JavaScript errors to the data loader to place in the log file.*/
function logJavaScriptError(eventStack){
    fetch(url, {
        method: 'POST',
        headers: {'Content-Type' : 'application/json'},
        body: JSON.stringify({
            'request': 'logjavascripterror',
            'eventStack': eventStack
        })
    }).catch((error) => {
        console.error("Error:", error)
        echo("Unable to connect to server.")
    })
}

/************************************************************Table Functions**********************************/
class Table {
    constructor(tableId, headers, data, tableContainer, caption){
        this.tableId = tableId
        this.headers = headers
        this.data = data
        this.tableContainer = document.getElementById(tableContainer)
        this.caption = caption
        this.thead = document.createElement('thead')
    }

    /**Builds the container for the table */
    buildTable(){
        let tableExists = document.getElementById(this.tableId)
        if(tableExists){
            document.getElementById(this.tableId).remove()
        }
        this.table = document.createElement('table')
        this.captionElement = document.createElement("caption")
        this.captionElement.setAttribute("class", "sr-only")
        this.captionElement.textContent = this.caption + " (column headers are sortable)."
        this.table.appendChild(this.captionElement)
        Object.assign(this.table, {
            id: this.tableId,
            classList: "usa-table usa-table--borderless",
            tabindex: "0",
        })
        document.getElementById(this.tableContainer.id).appendChild(this.table)
        this.tbody = document.createElement('tbody')
    }

    /**Builds the table header for the table */
    buildTableHeader(){
        this.table.appendChild(this.thead)
        this.thead.innerHTML = ""
        let row = document.createElement('tr')
        this.thead.appendChild(row)
        for(let head in this.headers){
            let col = document.createElement('th')
            let btn = document.createElement("button")
            row.appendChild(col)
            let btnText = document.createTextNode(head)
            btn.appendChild(btnText)
            btn.setAttribute("onclick", this.headers[head])
            col.setAttribute("role", "columnheader")
            col.setAttribute("scope", "col")
            let img = document.createElement('img')
            img.setAttribute("alt", "")
            img.setAttribute('src', '/static/images/sort_arrow.svg')
            btn.appendChild(img)
            col.appendChild(btn)
        }
    }

    // sort the Import table data by area symbol before the table is built. 
    sortImportTableData() {
        this.data.sort((a, b) => {
            if(Object.keys(a.areasymbols) < Object.keys(b.areasymbols)) {
                return -1;
            }
            if(Object.keys(a.areasymbols) > Object.keys(b.areasymbols)) {
                return 1;
            }
            return 0;
        });
        return this.data;
    }

    // sort the Database table data by area symbol before the table is built. 
    sortDBTableData() {
        let jsonData = this.data
        this.data = Object.keys(jsonData).sort().reduce(
            (obj, key) => {
                obj[key] = jsonData[key];
                return obj;
            },
            {}
        );
        return this.data;
    }
}

class CheckboxTable extends Table {
    constructor(tableId, headers, data, tableContainer, selectAllId, selectAllLabel, selectAllTitle, actionButton, checkboxId, checkboxClass, counterId, caption, oudatedSsaToggleId, outdatedSsaInfoTextId, nonExistingSsaToggleId, nonExistingSsaInfoTextId){
        //tableId must match the name of the class object that will be created.
            // I.E. let importTable = {tableId = importTable}
        super(tableId, headers, data, tableContainer, caption)
        this.selectAllId = selectAllId
        this.selectAllLabel = selectAllLabel
        this.selectAllTitle = selectAllTitle
        this.actionButton = actionButton
        this.checkboxId = checkboxId
        this.checkboxClass = checkboxClass
        this.counterId = counterId
        this.totalRows = 0
        this.selectedCheckboxes = []
        this.oudatedSsaToggle = document.getElementById(oudatedSsaToggleId)
        this.outdatedSsaInfoText = document.getElementById(outdatedSsaInfoTextId)
        this.nonExistingSsaToggle = document.getElementById(nonExistingSsaToggleId)
        this.nonExistingSsaInfoText = document.getElementById(nonExistingSsaInfoTextId)
    }

    buildCheckboxTableHeader(targetTbody = false){
        this.table.appendChild(this.thead)
        this.thead.innerHTML = ""
        let row = document.createElement('tr')
        this.thead.appendChild(row)
        let selectColumn = document.createElement('th')
        selectColumn.setAttribute("scope", "col")
        selectColumn.setAttribute("role", "columnheader")
        selectColumn.setAttribute("aria-label", "Select all rows")
        selectColumn.setAttribute("class", "usa-checkbox")
        row.appendChild(selectColumn)

        let selectColumnItem = document.createElement('input')
        Object.assign(selectColumnItem, {
            classList: 'usa-checkbox__input',
            type: 'checkbox',
            id: this.selectAllId,
            ariaLabel: this.selectAllLabel,
            title: this.selectAllTitle,
        })

        let selectColumnLabel = document.createElement('span')
        Object.assign(selectColumnLabel, {
            classList: 'usa-checkbox__label',
            role: 'checkbox',
        })
        selectColumnItem.setAttribute('onchange', `${this.tableId}.selectDeselectAll(${targetTbody})`)
        selectColumnLabel.setAttribute('onclick', `${this.tableId}.selectDeselectAll(${targetTbody})`) 
        selectColumnLabel.setAttribute('aria-labelledby', this.selectAllId) 

        selectColumn.appendChild(selectColumnItem)
        selectColumn.appendChild(selectColumnLabel)
        addEnterEventListener(selectColumnItem)
        for(let head in this.headers){
            let col = document.createElement('th')
            col.setAttribute("scope", "col")
            row.appendChild(col)
            let colText = document.createTextNode(head)
            col.appendChild(colText)
            col.setAttribute("onclick", this.headers[head][0])
            // Commenting out code for tooltips in table col header 
            // if(this.headers[head][1] != ""){    //header tooltip 
            //     let tooltipSpan = document.createElement('span')
            //     tooltipSpan.setAttribute('class', 'usa-tooltip')
            //     col.appendChild(tooltipSpan)


            //     let tooltipBtn = document.createElement('span')
            //     Object.assign(tooltipBtn, {
            //         classList: 'usa-tooltip__trigger',
            //         dataPosition: 'bottom',
            //         tabindex: '0',
            //         innerHTML: head,
            //     })
            //     tooltipSpan.appendChild(tooltipBtn)

            //     let tooltipMessage = document.createElement('span')
            //     Object.assign(tooltipMessage, {
            //         classList: 'usa-tooltip__body usa-tooltip__body--bottom',
            //         role: 'tooltip',
            //         ariaHidden: 'true',
            //         innerHTML: this.headers[head][1],
            //     })
            //     tooltipSpan.appendChild(tooltipMessage)
            // }
            addButtonFunctionality(col)
            col.setAttribute("role", "columnheader button")
            let img = document.createElement('img')
            img.setAttribute('alt', '')
            img.setAttribute('src', '/static/images/sort_arrow.svg')
            col.appendChild(img)
        }
    }

    /**Sets the attributes of select checkboxes. Must be called within a for loop. Returns row.*/
    setSelectCheckbox(appendToTable, tableBody, checkboxName, targetTbody = false){
        let row = document.createElement('tr')
        let col = document.createElement('th')
        col.setAttribute("class", "usa-checkbox")
        this.table.appendChild(tableBody)
        let checkbox = document.createElement('input')
        Object.assign(checkbox, {
            type: 'checkbox',
            classList: `${this.checkboxClass} usa-checkbox__input`,
            id: this.checkboxId + checkboxName,
            ariaLabel: this.checkboxId + checkboxName,
        })
        checkbox.setAttribute('onchange', `${this.tableId}.getSelectedCheckboxes(${targetTbody})`)
        addEnterEventListener(checkbox)

        let checkboxLabel = document.createElement('span')
        Object.assign(checkboxLabel, {
            classList: 'usa-checkbox__label',
            role: 'checkbox',
        })
        checkboxLabel.setAttribute('aria-labelledby', this.checkboxId + checkboxName) 

        if(appendToTable){
            tableBody.appendChild(row);
            row.appendChild(col)
            col.appendChild(checkbox)
            col.appendChild(checkboxLabel)
            // If Tabular only checkbox is selected, prechecks get reexecuted & the table is repainted.
            // In order to keep the UI updated with the rows that were selected, we have to re-check the
            // checkboxes and reapply the styling.
            if (importTable.selectedCheckboxes != null && importTable.selectedCheckboxes.includes(rowData.childfoldername))
            {
                checkbox.setAttribute('checked', 'true')
                checkbox.parentNode.parentNode.parentNode.setAttribute('style', 'background: #D4E2F2; border-bottom-color: #6c757d;')
            }
            return row
        }
    }

    /**Return list of selected checkbox, then create JSON object to return to server. */
    getSelectedCheckboxes(targetTbody = false){
        let table = document.getElementById(this.tableId)
        let checkBoxes = table.getElementsByClassName(this.checkboxClass)
        this.selectedCheckboxes = []
        for(var i = 0; i < checkBoxes.length; i++){
            if(checkBoxes[i].checked){
                let selectedName = checkBoxes[i].id
                this.selectedCheckboxes.push(selectedName.replace(this.checkboxId, ''))
                if(targetTbody){
                    checkBoxes[i].parentNode.parentNode.parentNode.setAttribute('style', 'background: #D4E2F2; border-bottom-color: #6c757d;')
                }
                else{
                    checkBoxes[i].parentNode.parentNode.setAttribute('style', 'background: #D4E2F2; border-bottom-color: #6c757d;')
                }
            }
            else{
                if(targetTbody){
                    checkBoxes[i].parentNode.parentNode.parentNode.setAttribute('style', 'border-bottom-color: #dee2e6;')
                }
                else{
                    checkBoxes[i].parentNode.parentNode.setAttribute('style', 'border-bottom-color: #dee2e6;')
                }
            }
            document.getElementById(this.counterId).innerHTML = `${this.selectedCheckboxes.length} out of ${this.totalRows} selected`
            if(this.selectedCheckboxes < 1){
                this.actionButton.disabled = true
            }
            else{
                this.actionButton.disabled = false
            }
        }
    }

    selectDeselectAll(targetTbody = false){
        let master = document.getElementById(this.selectAllId)
        let checkboxes = document.getElementsByClassName(this.checkboxClass)
        $(`#${this.selectAllId}`).trigger('click')
        if(master.checked){
            for(var i=0; i<checkboxes.length; i++){
                if(checkboxes[i].type=='checkbox'){
                    checkboxes[i].checked=true;
                }
            }
        }
        else{
            for(var i=0; i<checkboxes.length; i++){
                if(checkboxes[i].type=='checkbox'){
                    checkboxes[i].checked=false
                }
            }
        }
        this.getSelectedCheckboxes(targetTbody)
    }

    async displaySsaDiscrepencyNotifications() {
        let discrepencies = await ImportActivities.checkDataFreshness(this.data) 
        this.outdatedSSAs = []
        this.nonExistingSSAs = []
        this.oudatedSsaToggle.nextElementSibling.innerHTML = ''
        this.nonExistingSsaToggle.nextElementSibling.innerHTML = ''
        
        if(discrepencies && discrepencies.versionMismatch.length > 0){
            this.outdatedSSAs = discrepencies.versionMismatch
            this.setOutdatedSsaDisplay()
            this.populateOutdatedSsaMessage()
        } else {
            this.oudatedSsaToggle.setAttribute('style', 'display: none')
            else if (request == 'getstatus'){

        if(discrepencies && discrepencies.missingOnServer.length > 0){
            this.nonExistingSSAs = discrepencies.missingOnServer
            this.setNonExistingSsaDisplay()
            this.populateNonExistingSsaMessage()
        } else {
            this.nonExistingSsaToggle.setAttribute('style', 'display: none')
        }
            logJavaScriptError(error?.stack || String(error))

        // Need to implement logic here to dictate if a dbtable is being created or a folder table is being created
        //buildTable(data.databaseItems, 'databaseTable')

        //If we are expecting to return an item, return it.
        if(returnedResponse != null){
            return(returnedResponse)
        }

        return response
    }
    catch(err){
        const requestLabel = String(request ?? 'unknown-request')
        if (err?.name === 'AbortError') {
            sendLoggerWarning(`sendData timeout for request ${requestLabel}`)
        }
        sendLoggerWarning(`sendData failure for request ${requestLabel}: ${String(err?.message ?? err)}`)
        //The message in the Modal below only covers one error scenario. Other error Modals are needed.
        $('#serverClosedModal').modal("show")
        return null
    }
    finally {
        clearTimeout(timeoutID)
        }
        if(this.outdatedSsaInfoText.lastChild && this.outdatedSsaInfoText.lastChild.tagName == "P"){
            this.outdatedSsaInfoText.lastElementChild.remove()
        }
        let p = document.createElement('p')
        Object.assign(p, {
            classList: 'usa-alert__text',
            innerHTML: `Your database contains ${this.outdatedSSAs.length} outdated soil survey area(s). It is recommended that you delete the data from your database and download newer data. Click this message to view affected areas.`, 
        })
        this.outdatedSsaInfoText.appendChild(p)
    }
    
    setNonExistingSsaDisplay() {
        if(this.nonExistingSSAs.length > 0){
            this.nonExistingSsaToggle.removeAttribute('style')
        }
        else{
            this.nonExistingSsaToggle.setAttribute('style', 'display: none')
        }
    
        if(this.nonExistingSsaInfoText.lastChild && this.nonExistingSsaInfoText.lastChild.tagName == "P"){
            this.nonExistingSsaInfoText.lastElementChild.remove()
        }
        let p = document.createElement('p')
        Object.assign(p, {
            classList: 'usa-alert__text',
            innerHTML: `Your database contains ${this.nonExistingSSAs.length} soil survey area(s) that no longer exist(s). If you need help finding replacement data, contact the Soils Hotline. Click this message to view affected areas.`,
        })
        this.nonExistingSsaInfoText.appendChild(p)
    }

    populateOutdatedSsaMessage(){
        for(let ssa in this.outdatedSSAs) {
            let alertMessage = `${this.outdatedSSAs[ssa]} is outdated.` 
            populateAlertBtnAccordions("info", alertMessage, this.oudatedSsaToggle.nextElementSibling)
        }
    }
    
    /**Creates no longer existing area message */
    populateNonExistingSsaMessage(){
        for(let ssa in this.nonExistingSSAs) {
            let alertMessage = `${this.nonExistingSSAs[ssa]} no longer exists.` 
            populateAlertBtnAccordions("info", alertMessage, this.nonExistingSsaToggle.nextElementSibling)
        }
    }
}

class TreeViewTable extends Table {
    constructor(tableId, headers, data, tableContainer, editablePathId, clickablePathId, searchInputFieldId, showFiles, caption){
        super(tableId, headers, data, tableContainer, caption)
        this.editablePathId = editablePathId
        this.clickablePathId = clickablePathId
        this.searchInputFieldId = searchInputFieldId
        this.showFiles = showFiles
    }

    populatePathNavigation(){
        let root = rootPath
        root = root.replaceAll('//', '/')
        root = root.replaceAll('/', '\\')
        var parentFolder = root.split('\\')
        //If the folder is empty or is only a \ then remove it from the list
        for(let folder in parentFolder){
            if(((parentFolder[folder] == "" || parentFolder[folder] == '\\' || parentFolder[folder] == '/') && osPathSep == "\\") //Windows Logic
            || (osPathSep == "/" && folder != 0 && parentFolder[folder] == "")){ //Non-windows logic
                parentFolder.splice(folder, 1)
            }
        }
        var separateParentFolders = parentFolder
        parentFolder = parentFolder.join(osPathSep)
        this.createClickablePath(separateParentFolders)
        this.populateEditablePath()
    }

    createClickablePath(folders){
        var folderPath = []
        let clickablePathContanier = document.getElementById(this.clickablePathId)
        clickablePathContanier.innerHTML = ""
        //Builds out the clickable items to navigate the folders
        //else
        for(let folder in folders){
            if((folders[folder] != "" && osPathSep == "\\") || osPathSep == "/") {
                let folderPathTemp
                let folderName = folders[folder]
                //Set the root on non-windows environments to properly display
                if(folderName == "" && osPathSep == "/") {
                    folderName = "/"
                }
    
                folderPath += folders[folder] + '/'
                if((folderPath.length > 3 && folderPath.substr(-1) == "/" && osPathSep == "\\") //Windows Logic
                || (osPathSep == "/" && folder != 0)){// Non-windows logic
                    folderPathTemp = folderPath.substr(0, folderPath.length -1)
                }
                else{
                    folderPathTemp = folderPath
                }
                // update search field placeholder text with current (last) folder name 
                if(folder == folders.length - 1) {
                    document.getElementById(this.searchInputFieldId).placeholder = `Search ${folders[folder]}`
                }
    
                let clickablePathItem = document.createElement('li')
    
                let clickablePathItemLink = document.createElement('a')
                Object.assign(clickablePathItemLink, {
                    classList: 'usa-breadcrumb__link',
                    href: "javascript:void(0)",
                    id: `${this.clickablePathId}${folder}`
                })
                clickablePathItemLink.setAttribute('tabindex', '0')
                clickablePathItemLink.setAttribute('onclick', `executeFolderTreeRequest("${this.tableId}", "${folderPathTemp}", ${this.showFiles})`)
    
                let clickablePathItemLinkText = document.createElement('span')
                Object.assign(clickablePathItemLinkText, {
                    innerHTML: folderName,
                })
    
                if(folder < folders.length - 1) {
                    clickablePathItemLink.append(clickablePathItemLinkText)
                    clickablePathItem.append(clickablePathItemLink)
                    clickablePathContanier.append(clickablePathItem)
                    Object.assign(clickablePathItem, {
                        classList: 'usa-breadcrumb__list-item',
                    })
                } else {
                    clickablePathItem.append(clickablePathItemLinkText)
                    clickablePathContanier.append(clickablePathItem)
                    Object.assign(clickablePathItem, {
                        classList: 'usa-breadcrumb__list-item usa-current',
                        ariaCurrent: 'page',
                    })
                }
            }
        }
    }

    populateEditablePath(){
        let rootTextbox  = document.getElementById(this.editablePathId)
        //Standardize path
        let path = rootPath.replaceAll("/", osPathSep)
        rootTextbox.textContent = path
        rootTextbox.value = path
    }

    populateTreeViewTable(){
        this.populatePathNavigation()
        this.buildTable()
        this.buildTableHeader()
        Object.assign(this.table, {
            classList: "usa-table usa-table--borderless",
            tabindex: "0",
        })
        this.folderSection = document.createElement('tbody')
        this.folderSection.setAttribute('id', `${this.tableId}FolderSection`)
        this.fileSection = document.createElement('tbody')
        this.fileSection.setAttribute('id', `${this.tableId}FileSection`)
        //Remove any trailing "/" the user may have placed.
        if(rootPath.endsWith("/")){
            rootPath = rootPath.slice(0,-1)
        }
        for(let row in this.data){
            let tr = document.createElement('tr')
            tr.setAttribute("id", `tr-row-id-${row}`)
            if(this.data[row].type != "File Folder" && !this.showFiles ){
                continue
            }
            row = this.data[row]
            let img = document.createElement("img")
            for(let column in row){
                let td
                let i = 0
                if(column == "name"){
                    td = document.createElement("th")
                    td.setAttribute("rowgroup", "1")
                    td.setAttribute("scope", "rowgroup")
                    td.prepend(img)
                }
                else if(column == "containsssurgo" || column == "nodes"){
                    //These are backend flags that do not need to be displayed to the user.
                    continue
                }
                else{
                    td = document.createElement('td')
                }
                td.textContent += row[column]
                td.setAttribute("tabindex", "0")
                if((column != "type" && column != "size" && this.showFiles == false) || this.showFiles == true){
                    tr.appendChild(td)
                }
                if(row.type == "File Folder"){
                    if(i == 0){
                        img.setAttribute("src", "/static/images/folderIcon.svg")
                        img.setAttribute("alt", "")
                    }
                    if(row.containsssurgo && (BrowserStorage.getLocalStorage("limitnavigationdepth") === "true" || BrowserStorage.getLocalStorage("limitnavigationdepth") == undefined)){
                        //If we are preventing navigation, do not set a click event and present a gray icon.
                        img.setAttribute("class", "treeViewFolderIcon filter-gray")
                        Object.assign(tr, {className: "disabledRow", title:"This folder contains SSURGO data"})
                        tr.firstChild.setAttribute("aria-describedby", "rowHasSSURGODataDesc")
                    }
                    else{
                        let tableId = this.tableId
                        let showFiles = this.showFiles
                        td.setAttribute('onclick', `executeFolderTreeRequest("${tableId}", "${rootPath}/${row.name}", ${showFiles})`)
                        td.addEventListener("keydown", function(e) {
                            if (e.key == 'Enter' || e.key === ' ') {
                                executeFolderTreeRequest(tableId, `${rootPath}/${row.name}`, showFiles)
                            }
                        })
                        img.setAttribute("class", "treeViewFolderIcon filter-blue")
                    }
                    this.folderSection.appendChild(tr)
                }
                else{
                    if(row.type.toLowerCase() == "gpkg file" || row.type.toLowerCase() == "sqlite file"){
                        let fileExtension = row.type.toLowerCase().split(" ")[0]
                        td.setAttribute('onclick', `selectDatabase( "${rootPath}", "${rootPath}/${row.name}.${fileExtension}")`)
                        td.addEventListener("keydown", function(e) {
                            if (e.key == 'Enter' || e.key === ' ') {
                                selectDatabase(rootPath, `${rootPath}/${row.name}.${fileExtension}`)
                            }
                        })
                        if(i == 0){
                            img.setAttribute("src", "/static/images/emptyDatabaseIcon.svg")
                            img.setAttribute("class", "treeViewDatabaseIcon")
                            img.setAttribute("alt", "")
                        }
                        this.fileSection.appendChild(tr)
                    }
                }
                tr.firstElementChild.prepend(img)
                i++;
            }
        }
        this.table.appendChild(this.folderSection)
        this.table.appendChild(this.fileSection)
    }

    treeViewContainsSsurgo(elementId){
        if(this.data == undefined){
            //If there are no rows inside of the data, do not display a message.
            document.getElementById(elementId).setAttribute("hidden", true)
        }
        for(let row in this.data){
            if(this.data[row].containsssurgo === true){
                document.getElementById(elementId).removeAttribute("hidden")
                break
            }
            else{  
                document.getElementById(elementId).setAttribute("hidden", true)
            }
        }
    }
}
/*******************************************TREE VIEW METHODS*********************************************** */
let databaseTreeViewTable = new TreeViewTable(
    tableId = databaseTreeViewTableId,
    headers = databaseTreeViewHeaders,
    data = [],
    tableContainer = "databaseTreeViewTableContainer",
    editablePathId = "databaseTextBox",
    clickablePathId = "clickablePathOL",
    searchInputFieldId = "databaseSearchText",
    showFiles = true,
    caption = databaseTreeViewTableCaption
)

let importTreeViewTable = new TreeViewTable(
    tableId = importTreeViewTableId,
    headers = ssurgoTreeViewHeaders,
    data = [],
    tableContainer = "importTreeViewTableContainer",
    editablePathId = "ssaTextBox",
    clicakblePathId = "ssaClickablePathOL",
    searchInputFieldId = "ssaSearchTextbox",
    showFiles = false,
    caption = importTreeViewTableCaption
)

let downloadTreeViewTable = new TreeViewTable(
    tableId = downloadTreeViewTableId,
    headers = downloadTreeViewHeaders,
    data = [],
    tableContainer = "downloadTreeViewTableContainer",
    editablePathId = "downloadTextBox",
    clicakblePathId = "downloadClickablePathContainer",
    searchInputFieldId = "downloadSearchTextbox",
    showFiles = false,
    caption = downloadTreeViewTableCaption
)

async function landingPageInitializeTreeView(isCreate){
    let promise = initializeTreeView('databaseTreeViewTable', 'getdatabaseinventory')
    $("#homePageContainer, #landingPageContainer").hide()
    $("#selectDatabasePage").show()
    if(isCreate == true){
        $(".createDatabaseDisplay").show()
        $("#selectDatabasePageLabel").text('Create database')
    }
    else{
        $(".createDatabaseDisplay").hide()        
        $("#selectDatabasePageLabel").text('Select database')
    }
    $("#selectDatabasePageBackBtn").focus()
    $('#selectDatabasePageBackBtn').attr('lastView', 'landingPageContainer')
    await promise

    document.getElementById("ssaselector").addEventListener("onssadelete", DownloaderFunctions.ssaDelete);
}

function normalizeUiPath(path){
    return String(path ?? '').trim().replaceAll('\\', '/')
}

function isDriveRootUiPath(path){
    return /^[A-Za-z]:\/?$/.test(path)
}

async function getDefaultDownloadFolderPath(){
    try{
        const response = await fetch('/defaultDownloadFolder', {method: 'GET'})
        if(!response.ok){
            return undefined
        }

        const payload = await response.json()
        if(payload?.success && typeof payload.path == 'string'){
            return normalizeUiPath(payload.path)
        }
    }
    catch(error){
        echo(`Unable to resolve default download folder: ${error?.message ?? error}`)
    }

    return undefined
}

function navigateBackToLandingPage(focusElementId){
    $('#homePageContainer').show()
    $('#helpPaneContainer, #landingPageContainer, #downloadPageContainer').hide()
    $(`#${focusElementId}`).focus()
}

function displayLandingPage(){
    $('#landingPageFooter, #landingPageContainer').show()
    $('#helpPaneContainer, #homePageContainer, #selectDatabasePage, #selectSSAPage').hide()
}

/**Check if cookie exists, otherwise set default value. Then send request to the python server.*/
async function initializeTreeView(request, cookie){
    const isDownloadTreeRequest = request == downloadTreeViewTableId
    let path = normalizeUiPath(BrowserStorage.getLocalStorage(cookie))
    let pathCheck = undefined

    if(path){
        pathCheck = await doesPathExist(path)
    }

    const pathExists = Boolean(
        path
        && pathCheck
        && Array.isArray(pathCheck.failedfolders)
        && pathCheck.failedfolders.length == 0
    )

    if(pathExists && !(isDownloadTreeRequest && isDriveRootUiPath(path))){
        path = normalizeUiPath(BrowserStorage.getLocalStorage(cookie))
    }
    else if(isDownloadTreeRequest){
        const defaultDownloadPath = await getDefaultDownloadFolderPath()
        if(defaultDownloadPath){
            path = defaultDownloadPath
            BrowserStorage.setLocalStorage(cookie, defaultDownloadPath)
        }
        else if(osPathSep == "\\"){
            path = 'C:/'
        }
        else{
            path = "/"
        }
    }
    else if(osPathSep == "\\"){
        path = 'C:/'
    }
    else{
        path = "/"
    }

    requestLocation = request
    rootPath = path.replaceAll('\\', '/')
    rootPath = rootPath.replaceAll ('//', '/')
    let limitnavigationdepth
    let showFiles
    if(request == "importTreeViewTable"){
        if(BrowserStorage.getLocalStorage("limitnavigationdepth") != undefined){
            limitnavigationdepth = BrowserStorage.getLocalStorage("limitnavigationdepth") === "true"
        }
        else{
            limitnavigationdepth = true
        }
        maxdepth = 1
        showFiles = false
        selectLimitNavigationOptions(limitnavigationdepth)
    }
    else if(request == downloadTreeViewTableId){
        maxdepth = 1
        showFiles = false
    }
    else{
        maxdepth = 0
        limitnavigationdepth = false
        showFiles = true
    }
    let data = {'request': getFolderTreeRequest, 'path': rootPath, 'folderpattern' : "", 'ignorefoldercase': true,
        'filepattern' : "", 'ignorefilecase': true, 'showfiles': showFiles, 'maxdepth': maxdepth}
    await sendData(data)
}
async function continuePathNavigation(request, path, showfiles, folderPattern, toggleWarnings = true){
    path = path.replaceAll("\\", "/")
    let pathCheck = await doesPathExist(path)
    let object
    if(request == databaseTreeViewTableId){
        object = document.getElementById('databaseTextBox')
    }
    else if(request == importTreeViewTableId){
        object = document.getElementById('ssaTextBox')
    }
    else if(request == downloadTreeViewTableId){
        object = document.getElementById('downloadTextBox')
    }
    let parentPath = object.oldvalue
    if(parentPath == undefined){
        parentPath = object.value
    }
    parentPath = parentPath.replaceAll("\\", "/")
    if(parentPath == path){
        parentPath = parentPath.split("/").slice(0, -1).join("/")
    }
    if(pathCheck["failedfolders"].length != 0){
        let oldPathCheck = await doesPathExist(parentPath)
        if(oldPathCheck["failedfolders"].length != 0){
            if(request == downloadTreeViewTableId){
                const defaultDownloadPath = await getDefaultDownloadFolderPath()
                parentPath = defaultDownloadPath ? defaultDownloadPath : 'C:/'
            }
            else if(osPathSep == "\\"){
                parentPath = 'C:/'
            }
            else{
                parentPath = "/"
            }
        }
        if(toggleWarnings){
            const databaseTextBox = document.getElementById('databaseTextBox')
            const ssaTextBox = document.getElementById('ssaTextBox')
            const downloadTextBox = document.getElementById('downloadTextBox')
            if(request == databaseTreeViewTableId && databaseTextBox){
                databaseTextBox.value = databaseTextBox.oldvalue
            }
            else if(request == importTreeViewTableId && ssaTextBox){
                ssaTextBox.value = ssaTextBox.oldvalue
            }
            else if(request == downloadTreeViewTableId && downloadTextBox){
                downloadTextBox.value = downloadTextBox.oldvalue
            }
            document.getElementById('missingObjectModalBtn').click()
            document.getElementById('closeMissingObjectModal').setAttribute('onclick', `executeFolderTreeRequest('${request}', '${parentPath}', ${showfiles}, '${folderPattern}', true)`)
            document.getElementById('closeMissingObjectModalBtn').setAttribute('onclick', `executeFolderTreeRequest('${request}', '${parentPath}', ${showfiles}, '${folderPattern}', true)`)
            document.getElementById('missingObjectModal').addEventListener('click', function(e) {
                if(e.target.className == 'usa-modal-overlay') {
                    document.getElementById("closeMissingObjectModalBtn").click()
                }
            })
        }
        return false
    }
    return true
}

/**Sends "getfoldertree" request to the server*/
async function executeFolderTreeRequest(request, path, showfiles, folderPattern = "", isCloseMissingObjectModal = false){
    const databaseTextBox = document.getElementById('databaseTextBox')
    const ssaTextBox = document.getElementById('ssaTextBox')
    const downloadTextBox = document.getElementById("downloadTextBox")
    //Variable to gather the value of the tree view current path. We cannot use rootPath as the value could be the opposite tree view value
    let goodPath = await continuePathNavigation(request, path, showfiles, folderPattern)
    if(!goodPath){
        return
    }
    requestLocation = request
    let maxdepth
    let limitNavigationChoice
    //If cookie exists set use that value, else default to true
    if(BrowserStorage.getLocalStorage("limitnavigationdepth") != undefined){
        limitNavigationChoice = BrowserStorage.getLocalStorage("limitnavigationdepth") === 'true'
    }
    else{
        limitNavigationChoice = true
    }
    if (!showfiles){
        //User uses the suggested depth. MUST USE maxdepth OF 1!
        maxdepth = 1
    }
    else{
        maxdepth = 0
    }
    //Clean up paths. We will send out the file path using the "/" as this simplifies the response returned
    rootPath = path.replaceAll('\\', '/')
    rootPath = rootPath.replaceAll ('//', '/')
    let data = {'request': getFolderTreeRequest, 'path': rootPath, 'folderpattern' : `.*${folderPattern}.*`, 'ignorefoldercase': true,
        'filepattern' : `.*${folderPattern}.*`, 'ignorefilecase': true, 'showfiles': showfiles, 'maxdepth': maxdepth}
    await sendData(data)
    if(request == databaseTreeViewTableId){
        databaseTextBox.oldvalue = rootPath
    }
    else if(request == importTreeViewTableId){
        ssaTextBox.oldvalue = rootPath
    }
    else if(request == downloadTreeViewTableId){
        downloadTextBox.oldvalue = rootPath
    }

    // Refocus cursor to file path after closing Missing Object modal 
    if (isCloseMissingObjectModal == true) {
        // focus DB selection filepath 
        if($("#clickablePathOL").is(":visible")) { 
            document.getElementById("clickablePathOL0").focus()
        }
        // focus SSURGO Data folder selection filepath 
        if($("#ssaClickablePathOL").is(":visible")) { 
            document.getElementById("ssaClickablePathOL0").focus() 
        }
        // focus to DB selection filepath textbox 
        if($("#databaseTextBox").is(":visible")) { 
            databaseTextBox.focus() 
        }
        // focus to SSURGO Data folder selection filepath textbox 
        if($("#ssaTextBox").is(":visible")) { 
            ssaTextBox.focus() 
        }
        if($("#downloadTextBox").is(":visible")){
            downloadTextBox.focus()
        }
    } 
}

/**Build the limitNavigaiton select options */
function selectLimitNavigationOptions(limitNavigationChoice){
    let enabledOption = document.getElementById("enableFolderLimit")
    let disabledOption = document.getElementById("disableFolderLimit")

    if(limitNavigationChoice){
        enabledOption.setAttribute("selected", "selected")
        disabledOption.removeAttribute("selected")
        document.getElementById("folderNavDescription").innerText = "SSURGO Portal will help you find the right folder by preventing you from navigating too far."
    }
    else{
        disabledOption.setAttribute("selected", "selected")
        enabledOption.removeAttribute("selected")
        document.getElementById("folderNavDescription").innerHTML = ""
    }
}

/**Gets the updated value of a element. {I.E. user types in a textbox}*/
function updatedValue(elementId){
    val = document.getElementById(elementId).value
    return val
}

/**Checks the file system to see if a folder or file exists. Returns a boolean */
async function doesPathExist(path){
    const requestedPaths = Array.isArray(path) ? path : [path]
    const normalizedPaths = requestedPaths
        .filter((value) => typeof value == 'string')
        .map((value) => value.trim())
        .filter((value) => value.length > 0)

    if(normalizedPaths.length == 0){
        return {"failedfolders": []}
    }

    try{
        const response = await fetch(fileCheckUrl, {
            method : 'POST',
            headers: {'Content-Type' : 'application/json'},
            body: JSON.stringify(normalizedPaths),
        })

        if(!response.ok){
            $('#serverClosedModal').modal("show")
            return {"failedfolders": normalizedPaths}
        }

        const payload = await response.json()
        if(!payload || !Array.isArray(payload.failedfolders)){
            return {"failedfolders": normalizedPaths}
        }

        return payload
    }
    catch(e){
        if(e instanceof TypeError){
            echo("Unable to connect to server.")
            $('#serverClosedModal').modal("show")
        }
        else{
            echo(e?.message ?? e)
        }

        return {"failedfolders": normalizedPaths}
    }
}

async function selectDatabase(cookieRoot,  path){
    document.getElementById('helpPaneContainer').setAttribute("style", "display: none") //close the help menu if it was open before navigating away
    document.getElementById("selectDatabasePage").hidden; //Hides the selectDatabasePage and returns the user to the previous page they were on (Either 'Import SSURGO Data, 'SSURGO Data in Database' or 'Soil Data Viewer')
    document.getElementById("deleteBtn").disabled = true //disable the delete button after selecting a database
    $("#sdvSelectMessage").html("<strong>Please select a rating to perform aggregation.</strong>")
    //always reset the deleteCheckboxesSelected[] array
    deleteCheckboxesSelected = []
    BrowserStorage.setLocalStorage(databaseTableRequest, cookieRoot)
    databasePath = path
    let data = {'request' : databaseTableRequest, 'database' : databasePath, 'wheretext' : ""}
    let pathCheck = await doesPathExist(path)   
    if(pathCheck["failedfolders"].length != 0){
        document.getElementById('missingObjectModalBtn').click()
        document.getElementById("closeMissingObjectModal").setAttribute("onclick", `executeFolderTreeRequest('${databaseTreeViewTable.tableId}', '${rootPath}', true, undefined, true)`)
        document.getElementById("closeMissingObjectModalBtn").setAttribute("onclick", `executeFolderTreeRequest('${databaseTreeViewTable.tableId}', '${rootPath}', true, undefined, false)`)
        document.getElementById('missingObjectModal').addEventListener('click', function(e) {
            if(e.target.className == 'usa-modal-overlay') {
                document.getElementById("closeMissingObjectModalBtn").click()
            }
        })
    }
    else{
        sendData(data)
        // If folderPath exists (meaning a local SSURGO Data Folder has been selected), we need to call selectSSAParentFolder() so the Import SSURGO
        // Data table gets rebuilt based off the data in the newly selected database AND pre-tests are re-executed.
        if (folderPath != null) {
            ImportActivities.selectSSAParentFolder(folderPath)
        }
        getSDVAttributesByFolder() //This function executes the request to populate SdvFolders list everytime a database is selected
    }
}

function promptUsersToImport(){
    $("#promptUsersToImport").show()
    $("#promptUsersToImport").attr('aria-hidden', false)
}

async function selectDownloadParentFolder(path) {
    document.getElementById('selectedDownloadFolderName').value = path;
}

async function createDownloadFolderInCurrentPath(){
    const downloadTextBox = document.getElementById('downloadTextBox')
    const currentPath = normalizeUiPath(rootPath || downloadTextBox?.value)

    if(!currentPath){
        alert('Select a parent folder before creating a new folder.')
        return
    }

    const rawFolderName = window.prompt('Enter a name for the new folder:')
    if(rawFolderName === null){
        return
    }

    const folderName = String(rawFolderName).trim()
    if(!folderName){
        alert('Folder name cannot be empty.')
        return
    }

    try{
        const response = await fetch('/createDownloadFolder', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({parent: currentPath, folderName: folderName}),
        })

        if(!response.ok){
            alert(`Unable to create folder (${response.status}).`)
            return
        }

        const payload = await response.json()
        if(!payload?.success || typeof payload.path != 'string'){
            alert(payload?.message ?? 'Unable to create folder.')
            return
        }

        const createdPath = normalizeUiPath(payload.path)
        if(BrowserStorage){
            BrowserStorage.setLocalStorage('downloadpath', createdPath)
        }

        await executeFolderTreeRequest(downloadTreeViewTable.tableId, createdPath, false)

        if(downloadTextBox){
            downloadTextBox.value = createdPath
            downloadTextBox.oldvalue = createdPath
        }
    }
    catch(error){
        alert(`Unable to create folder: ${error?.message ?? error}`)
    }
}

    /**This class contains all of the import related activities.
     * TODO: Gather all of the import related activities, place it within this class, and put the class in a separate file.
     */
class ImportActivities{
    constructor(){}

    static async checkDataFreshness(records){
        const sdaService = await import("sdaService");

        let localRecords = []
        if (Array.isArray(records)) {
            localRecords = records
                .filter((record) => record && typeof record === 'object')
                .map((record) => {
                    const areaSymbol = record.areaSymbol ?? record.areasymbol ?? record.AREASYMBOL
                    return areaSymbol ? { ...record, areaSymbol } : null
                })
                .filter((record) => record !== null)
        }
        else if (records && typeof records === 'object') {
            localRecords = Object.entries(records)
                .map(([key, value]) => {
                    if (!value || typeof value !== 'object') {
                        return null
                    }

                    const areaSymbol = value.areaSymbol ?? value.areasymbol ?? value.AREASYMBOL ?? key
                    return areaSymbol ? { ...value, areaSymbol } : null
                })
                .filter((record) => record !== null)
        }

        return await sdaService.checkSurveyAreas(localRecords, SDA_POSTREST_URL);
    }

/**Set Import Folder cookie, then send request to server to pretest subfolders */
    static async selectSSAParentFolder(path, resetCheckboxes = true){
        ImportActivities.hidePromptForImport()
        document.getElementById("importNavLink").click() //Default back to the Import table
        //always reset the importTable.selectedCheckboxes[] array
        if (resetCheckboxes) {
            importTable.selectedCheckboxes = []
        }
        //define elements
        let errorDiv = document.getElementById('errorDiv')
        let loadScreen = document.getElementById('folderLoadingScreen')
        let table = document.getElementById(importTableId)
        let tableFooter = document.getElementById('folderRecordCounter')
        let errorDivBtn = document.getElementById('toggleErrorDiv')
        let duplicateDiv = document.getElementById('duplicateDiv')
        let duplicateDivBtn = document.getElementById('toggleDuplicateDiv')
        let refreshBtn = document.getElementById('refreshBtn')
        //disable buttons while loading
        Array.from(document.getElementsByClassName('toggleDisableOnLoad')).forEach(element => element.disabled = true)
        Array.from(document.getElementsByClassName('nav-link')).forEach(element => element.disabled = false)
        //If table exists, hide
        if(typeof(table) != 'undefined' && table != null){
            table.setAttribute('style', 'display:none;')
            tableFooter.setAttribute('style', 'display:none;')
        }
        loadScreen.removeAttribute('style')
        errorDivBtn.setAttribute('style', 'display:none;')
        duplicateDivBtn.setAttribute('style', 'display:none;')
        errorDiv.innerHTML = ''
        duplicateDiv.innerHTML = ''
        BrowserStorage.setLocalStorage(pretestImportCandidatesRequest, path)
        folderPath = path
        let isTabularOnly = document.getElementById('loadTabularData').checked
        let data = {'request' : pretestImportCandidatesRequest, 'database' : databasePath, 'root' : folderPath, 'istabularonly': isTabularOnly}
        await sendData(data)
        //Display table and hide loading message
        table = document.getElementById(importTableId) //redefine table. This is necessary if the table did not exist before sendData.
        tableFooter = document.getElementById('folderRecordCounter')
        loadScreen.setAttribute('style', 'display:none;')
        table.removeAttribute('style')
        tableFooter.removeAttribute('style')
        refreshBtn.setAttribute('style', 'display: block') //display refreshBtn after building table
        //re-enable buttons after pretests are complete
        Array.from(document.getElementsByClassName('toggleDisableOnLoad')).forEach(element => element.disabled = false)
        if(databaseTable.selectedCheckboxes.length <= 0){
            document.getElementById('deleteBtn').disabled = true
        }
        if (importTable.selectedCheckboxes.length <= 0) {
            document.getElementById('importBtn').disabled = true
        }
    }

    /**Allow the user to navigate from the download confirmation page to the import table. */
    static downloadToImportTable(downloadPath){
        $('#selectDownloadPageBackBtn').click()
        $('#downloadPageBackBtn').click()
        this.selectSSAParentFolder(downloadPath)
    }

    static hidePromptForImport(){
        $("#promptUsersToImport").hide()
        $("#promptUsersToImport").attr('aria-hidden', true)
    }
}
//re-execute pre-tests when the "Load Tabular Data Only" button is clicked
$("#loadTabularData").click(function(){
    ImportActivities.selectSSAParentFolder(folderPath, false)
})

//re-execute pre-tests when the "Refresh" button is clicked
$("#refreshBtn").click(function(){
    ImportActivities.selectSSAParentFolder(folderPath, false)
})

//Display the "Refresh" button next to the Import SSURGO Data Tab when it's clicked AND the folderPath (SSURGO Data folder) has been set
$("#importNavLink").click(function(){
    if(folderPath) {
        document.getElementById("refreshBtn").setAttribute("style", "display: block")
    }
})

/************************************************************END TREE VIEW METHODS ********************************* */

let importTable = new CheckboxTable(
    tableId = importTableId,
    headers = importTableHeaders,
    data = [],
    tableContainer = importTableContainer,
    selectAllId = 'selectDeselectAllSSA',
    selectAllLabel = 'Select Folder',
    selectAllTitle = 'Select All Folders',
    actionButton = document.getElementById('importBtn'),
    checkboxId = 'importCheckbox',
    checkboxClass = 'folderCheckbox customCheckbox',
    counterId = 'folderRecordCounter',
    caption = importTableCaption,
    '',
    '',
    '',
    '',
    selectedCheckboxes = []
);

let databaseTable = new CheckboxTable(
    tableId = dbTableId,
    headers = dbTableHeaders,
    data = [],
    tableContainer = dbTableContainer,
    selectAllId = 'selectDeselectAllDatabase',
    selectAllLabel = 'Select Database Inventory',
    selectAllTitle = 'Select All Database Inventory',
    actionButton = document.getElementById('deleteBtn'),
    checkboxId = 'deleteCheckbox',
    checkboxClass = 'dataCheckbox customCheckbox',
    counterId = 'databaseRecordCounter',
    caption = dbTableCaption,
    'toggleDbOutdatedSsaInfoDiv',
    'outdatedDbSsaInfoText',
    'toggleDbNonExistingSsaInfoDiv',
    'nonExistingDbSsaInfoText',
    selectedCheckboxes = []
)

function buildDatabaseTable(){
    let data = databaseTable.sortDBTableData()
    databaseTable.buildTable()
    document.getElementById("databaseRecordCounter").innerHTML = `${databaseTable.selectedCheckboxes.length} out of ${databaseTable.totalRows} selected`
    databaseTable.buildCheckboxTableHeader()
    let tableBody = document.createElement('tbody')
    tableBody.setAttribute('id', 'databaseTableBody')
    let table = document.getElementById(databaseTable.tableId)
    table.appendChild(tableBody)
    for(subData in data){
        rowData = data[subData]
        let row = databaseTable.setSelectCheckbox(true, tableBody, subData)
        row.setAttribute("rowspan", "1")
        row.setAttribute("scope", "rowgroup")
        tableBody.appendChild(row)
        prevSelRowIdxDB = 0
        // select rows in table 
        row.addEventListener("click", function(e) {
            const allDatabaseTableRows = document.querySelectorAll('#databaseTable tbody .dataCheckbox')
            if(e.shiftKey) {
                if(e.target.type == 'checkbox' || e.target.matches('.usa-checkbox__label')) {
                    // if checkbox specifically is targeted (keyboard access)
                    currRowIdxDB = $(e.target.parentElement.parentElement).index()
                } else {
                    // anywhere in row is clicked 
                    currRowIdxDB = $(e.target.parentElement).index()
                }
                multiRowSelect(e, allDatabaseTableRows, prevSelRowIdxDB, currRowIdxDB) 
            }
            // Select checkbox when targeted (keyboard access) - set prevSelRowIdxImport (starting index)
            else if(e.target.type == 'checkbox') {
                prevSelRowIdxDB = $(e.target.parentElement.parentElement).index()
            }
            // Select checkbox when checkbox cell is clicked - set prevSelRowIdxImport (starting index)
            else if(e.target.matches('.usa-checkbox__label')) {
                prevSelRowIdxImport = $(e.target.parentElement.parentElement).index()
                $(allDatabaseTableRows[prevSelRowIdxImport]).trigger('click')
            }
            // Select checkbox on click anywhere in the row - set prevSelRowIdxImport (starting index) 
            else if(e.target.type !== 'checkbox') {
                prevSelRowIdxDB = $(e.target.parentElement).index()
                $(allDatabaseTableRows[prevSelRowIdxDB]).trigger('click')
            }
        })
        col = document.createElement('th')
        col.setAttribute("scope", "row")
        row.appendChild(col)
        let colText = document.createTextNode(subData)
        col.appendChild(colText)
        for(cell in rowData){
            if(cell == 'saversion'){
                continue;
            }

            let cellValue = rowData[cell]
            col = document.createElement('td')
            row.appendChild(col)
            if(cell == "saverest"){
                cellValue = formatDate(cellValue)
            }
            colText = document.createTextNode(cellValue)
            if(cell != 'istabularonly'){
                col.appendChild(colText)
            }
            //Add checkmark if SSA is tabular only
            else if(cell == "istabularonly" && rowData[cell] != false){
                let img = document.createElement("img")
                img.setAttribute("aria-label", "is tabular only")
                img.setAttribute("src", "/static/images/checkmarkFilled.svg")
                img.setAttribute("class", "filter-blue")
                col.appendChild(img)
                col.setAttribute('value', 'true')
            }
            else if(cell == "istabularonly" && rowData[cell] == false){
                col.setAttribute('value', 'false')
            }
        }
    }
}

function buildImportTable(table = importTable){
    let data = table.sortImportTableData()
    table.buildTable()
    document.getElementById(table.tableId).classList.remove("table-hover")
    if(folderPath == null){
        document.getElementById("importAdvancedOptionsBtn").disabled = true
    }
    else{
        document.getElementById("importAdvancedOptionsBtn").disabled = false
    }
    table.buildCheckboxTableHeader(true)
    duplicateSSAs = {}
    for(subData in data){
        let tableBody = document.createElement('tbody')
        rowData = data[subData]
        if(rowData.preteststatus){
            let row = table.setSelectCheckbox(rowData.preteststatus, tableBody, rowData.childfoldername, true)
            row.firstChild.setAttribute("rowspan", Object.keys(data[subData].areasymbols).length)
            row.firstChild.setAttribute("scope", "rowgroup")
            // select rows in table 
            prevSelRowIdxImport = 0
            tableBody.addEventListener("click", function(e) {
                const allImportTableRows = document.querySelectorAll(`#${table.tableId} tbody .folderCheckbox`)
                if(e.shiftKey) {
                    if(e.target.type == 'checkbox' || e.target.matches('.usa-checkbox__label')) {
                        // if checkbox specifically is targeted (keyboard access) OR checkbox cell is clicked 
                        currRowIdxImport = $(e.target.parentElement.parentElement.parentElement).index() - 2
                    } else {
                        // anywhere in row is clicked 
                        currRowIdxImport = $(e.target.parentElement.parentElement).index() - 2
                    }
                    multiRowSelect(e, allImportTableRows, prevSelRowIdxImport, currRowIdxImport) 
                }
                // Select checkbox when targeted (keyboard access) - set prevSelRowIdxImport (starting index)
                else if(e.target.type == 'checkbox') {
                    prevSelRowIdxImport = $(e.target.parentElement.parentElement.parentElement).index() - 2
                }
                // Select checkbox when checkbox cell is clicked - set prevSelRowIdxImport (starting index)
                else if(e.target.matches('.usa-checkbox__label')) {
                    prevSelRowIdxImport = $(e.target.parentElement.parentElement.parentElement).index() - 2 
                    $(allImportTableRows[prevSelRowIdxImport]).trigger('click')
                    console.log("all rows", allImportTableRows)
                    console.log("all rows idx", allImportTableRows[prevSelRowIdxImport])
                }
                // Select checkbox on click anywhere in the row - set prevSelRowIdxImport (starting index)
                else if(e.target.type !== 'checkbox') {
                    prevSelRowIdxImport = $(e.target.parentElement.parentElement).index() - 2
                    $(allImportTableRows[prevSelRowIdxImport]).trigger('click')
                    $(allImportTableRows[prevSelRowIdxImport]).checked = true
                }
            })
            tableBody.setAttribute("id", rowData.childfoldername)
            //For each value within rowData
            for(cell in rowData){
                if(cell == "childfoldername"){
                    cellValue = rowData[cell]
                    col = document.createElement('th')
                    col.setAttribute("rowspan", Object.keys(data[subData].areasymbols).length)
                    col.setAttribute("scope", "rowgroup")
                    colText = document.createTextNode(cellValue)
                    displayDuplicateSSA(rowData, col)
                    saveDuplicateSSA(rowData)
                    col.appendChild(colText)
                    row.appendChild(col)
                }
                /*Logic to build out subsections of the table. This will place each folder and the associated areas within the folder in its own tbody.*/
                else if(cell == "areasymbols"){
                    currentAreas = 0
                    for(area in rowData.areasymbols){
                        cellValue = area
                        col = document.createElement('td')
                        //If a folder has more than 1 associated areas, place two empty td's to format table correctly.
                        if(currentAreas > 0){
                            row = document.createElement('tr')
                            tableBody.appendChild(row)
                        }
                        colText = document.createTextNode(cellValue)
                        col.appendChild(colText)
                        row.appendChild(col)
                        //For each attribute within the areasymbol build out the table row
                        for(value in rowData.areasymbols[area]){
                            cellValue = rowData.areasymbols[area][value]
                            if((value =="dbversion" || value == "fileversion") && cellValue !=""){
                                cellValue = formatDate(cellValue)
                            }
                            col = document.createElement('td')
                            colText = document.createTextNode(cellValue)
                            col.appendChild(colText)
                            row.appendChild(col)
                            //Logic to populate the Exists in database column
                            if(value =="fileversion"){
                                let inDatabaseCol = document.createElement('td')
                                row.appendChild(inDatabaseCol)

                                //Value does not exist in the database
                                if(rowData.areasymbols[area]["dbversion"] == ""){
                                    //Set value for sorting and 508 reasons
                                    inDatabaseCol.setAttribute("value", "Not in Database")
                                    continue
                                }

                                //Add checkmark tooltip 
                                let tooltipSpan = document.createElement('span')
                                tooltipSpan.setAttribute('class', 'usa-tooltip')
                                inDatabaseCol.appendChild(tooltipSpan)
                                let img = document.createElement('img')
                                tooltipSpan.appendChild(img)
                                Object.assign(img, {
                                    classList: 'usa-tooltip__trigger green-check-icon',
                                    dataPosition: 'bottom',
                                    tabindex: '0',
                                })
                                let tooltipMessage = document.createElement('span')
                                Object.assign(tooltipMessage, {
                                    classList: 'usa-tooltip__body usa-tooltip__body--bottom',
                                    role: 'tooltip',
                                    ariaHidden: 'true',
                                })
                                //Database version and Folder version match
                                if(rowData.areasymbols[area]["fileversion"] == rowData.areasymbols[area]["dbversion"]){
                                    img.setAttribute("src", "/static/images/checkmarkFilled.svg")
                                    img.setAttribute("alt", "SSURGO folder version date matches the SSURGO database version date.")
                                    img.classList.add("filter-green")
                                    tooltipMessage.innerHTML = "SSURGO folder version \r date matches the \r SSURGO database \r version date."
                                    inDatabaseCol.setAttribute("value", "Versions match")
                                }
                                //Database version and Folder verion do NOT match
                                else{
                                    img.setAttribute("src", "/static/images/warningIcon.svg")
                                    img.setAttribute("alt", "SSURGO folder version date does NOT match the SSURGO database version date.")
                                    inDatabaseCol.setAttribute("value", "Versions do not match")
                                    tooltipMessage.innerHTML = "SSURGO folder version \r date does NOT match \r the SSURGO database \r version date."
                                }
                                tooltipSpan.appendChild(tooltipMessage)
                            }
                        }
                        currentAreas++
                    }
                }
            }
        tableBody.appendChild(row)
        }
        else{
            populateErrorMessage(rowData, true)
            // If checkboxes were previously selected, but no longer pass the pre-test, we need to remove them
            // from the importTable.selectedCheckboxes Array. This only applies to the Import SSURGO Data Table.
            if (table.selectedCheckboxes != null && table.selectedCheckboxes.includes(rowData.childfoldername)) {
                let index = table.selectedCheckboxes.indexOf(rowData.childfoldername)
                table.selectedCheckboxes.splice(index, 1)
            }
        }
    }
    document.getElementById(table.counterId).innerHTML = `${table.selectedCheckboxes.length} out of ${table.totalRows} selected`
    populateDuplicateMessage()
}

/**Select multiple rows when shift key is held */
function multiRowSelect(e, allTableRows, prevSelectedRowIdx, currRowIdx) { 
    prevSelectedRowIdx < currRowIdx ? (fromRowIdx = prevSelectedRowIdx, toRowIdx = currRowIdx) : (fromRowIdx  = currRowIdx, toRowIdx = prevSelectedRowIdx) 
    for(let i = fromRowIdx; i < toRowIdx + 1; i++) {
        if(!allTableRows[i].checked) {
            $(allTableRows[i]).trigger('click')
            $(allTableRows[i]).checked = true
        }
    } 
}

/**Adds info icon to columns sharing duplicate area symbols */
function displayDuplicateSSA(folderResponse, column){
    if("sharedSSAs" in folderResponse){
        //Adding an icon to the table row
        let infoTooltipSpan = document.createElement('span')
        infoTooltipSpan.setAttribute('class', 'usa-tooltip')
        
        img = document.createElement("img")
        Object.assign(img, {
            src: '/static/images/infoIcon.svg',
            alt: 'duplicate areasymbol warning ',
            classList: 'infoIcon usa-tooltip__trigger',
            dataPosition: 'bottom',
            tabindex: '0',
        })

        let infoTooltipText = document.createElement('span')
        Object.assign(infoTooltipText, {
            classList: 'usa-tooltip__body usa-tooltip__body--bottom is-visible',
            role: 'tooltip',
            ariaHidden: 'true',
            innerHTML: 'This folder shares common \r area symbol(s) with \r another folder(s)',
        })

        // img.setAttribute("src", "/static/images/infoIcon.svg")
        // img.setAttribute("alt", "duplicate areasymbol warning ")
        // img.setAttribute("title", "This folder shares common \r area symbol(s) with \r another folder(s)")
        // img.setAttribute("class", "infoIcon")
        // column.appendChild(img)

        infoTooltipSpan.appendChild(img)
        infoTooltipSpan.appendChild(infoTooltipText)
        column.appendChild(infoTooltipSpan)
    }
}

/**Saves the duplicate area symbols into an accessable variable */
function saveDuplicateSSA(folderResponse){
    if("sharedSSAs" in folderResponse ){
        for(ssa in folderResponse.sharedSSAs){
                if(!(ssa in duplicateSSAs)){
                    duplicateSSAs[ssa] = [folderResponse.childfoldername]
                }
                else{
                    duplicateSSAs[ssa].push(folderResponse.childfoldername)
                }
        }
    }
}

/**Creates duplicate area message */
function populateDuplicateMessage(){
    for(ssa in duplicateSSAs) {
        let alertMessage = `${ssa} is found in the following folders: ${duplicateSSAs[ssa].join(', ') }` 
        populateAlertBtnAccordions("info", alertMessage, document.getElementById("duplicateDiv"))
    }
}

/**Set the value for the total folder counters */
function getTotalFolders(folders){
    importTable.errorFolders = 0
    importTable.totalRows = 0
    for(item in folders){
        if(folders[item].preteststatus){
            importTable.totalRows += 1
        }
        else{
            importTable.errorFolders += 1
        }
    }
}

/**Resets the pretest error collapse button */
function setErrorToggleDisplay(){
    let errorDiv = document.getElementById('toggleErrorText')
    //Prevent duplication while keeping the img
    if(errorDiv.lastChild.tagName == 'P'){
        errorDiv.lastElementChild.remove()
    }
    let p = document.createElement('p')
    Object.assign(p, {
        classList: 'usa-alert__text',
        innerHTML: `${importTable.errorFolders} folders have errors. Files inside these folders do not match the structure needed to import. Click this message to view.`,
    })
    errorDiv.appendChild(p)
}

function setDuplicateToggleDisplay(){
    let duplicateDiv = document.getElementById('toggleDuplicateText')
    if(duplicateDiv.lastChild.tagName == "P"){
        duplicateDiv.lastElementChild.remove()
    }
    let p = document.createElement('p')
    Object.assign(p, {
        classList: 'usa-alert__text',
        innerHTML: `${Object.keys(duplicateSSAs).length} area symbol(s) are found in multiple folders. Click this message to view.`,
    })
    duplicateDiv.appendChild(p)
}

/**Creates the error message for folders that fail pretest */
function populateErrorMessage(rowData, isPretest) {
    let errorMessage = rowData["errormessage"].replaceAll("/", "\\")
    if(isPretest) {
        alertMessage = `${rowData["childfoldername"]}: <b>Error Message:</b> ${errorMessage}`
        errorDiv = document.getElementById('errorDiv')
        populateAlertBtnAccordions("warning", alertMessage, errorDiv)
    } else {
        // progress error button accordion 
        alertMessage = `${rowData["areaname"]} <b>Error Message:</b> ${errorMessage}`
        progressErrorDiv = document.getElementById("progressErrorDiv")
        populateAlertBtnAccordions("error", alertMessage, progressErrorDiv)
    }

    //button will be implemented at a later time
    /*
        let btn = document.createElement('button')
        btn.setAttribute('class', 'errorButton')
        btn.setAttribute('id', `errorButton${rowData['childfoldername']}`)
        btn.innerHTML = "How to fix the problem?"
        div.appendChild(btn)
    */
}

function populateAlertBtnAccordions(alertType, alertMessage, parentElement) {
    //define elements
    let alertDiv = document.createElement('div')
    Object.assign(alertDiv, {
        classList: `usa-alert usa-alert--${alertType} usa-alert--slim`,
    })

    let alertBodyDiv = document.createElement('div')
    Object.assign(alertBodyDiv, {
        classList: 'usa-alert__body',
    })

    let alertText = document.createElement('p')
    Object.assign(alertText, {
        classList: 'usa-alert__text',
    })
    alertText.innerHTML = alertMessage

    //Append children
    alertBodyDiv.appendChild(alertText)
    alertDiv.appendChild(alertBodyDiv)
    parentElement.appendChild(alertDiv)
}

/*******************************Sort Logic******************************************/

function sortDateLogic(xDate, yDate, isAscending){
    let xdate = new Date(Date.parse(xDate))
    let ydate = new Date(Date.parse(yDate))
    if(isAscending){
        if((!dateIsValid(xdate) && dateIsValid(ydate)) || (xdate > ydate)){
            return true
        }
        else{
            return false
        }
    }
    else{
        if((dateIsValid(xdate) && !dateIsValid(ydate)) || (xdate < ydate)){
            return true
        }
        else{
            return false
        }
    }
}

function dateIsValid(date){
    return date instanceof Date && !isNaN(date)
}

function doubleSort(n, target1, target2, sortLogic){
    sortTable(n, target1, false, sortLogic)
    sortTable(n, target2, false, sortLogic)
}

// JavaScript program to illustrate
// Table sort for both columns and both directions.
function sortTable(n, target, isCheckboxTable, typeOfSort, recordRowType = "tr" ) {
    let tableBody;
    tableBody = document.getElementById(target);
    let i, x, y, count = 0;
    let switching = true;
    let table = document.querySelector(`#${tableBody.getAttribute("id")}`).parentElement
    // Order is set as ascending
    let direction = "ascending";
    let sortImages
    if(recordRowType == "tr"){
        sortImages = document.querySelectorAll(`#${table.getAttribute("id")} >thead>tr>th>button>img`)
    }
    else{
        sortImages = document.querySelectorAll(`#${table.getAttribute("id")} table>thead>tr>th>button>img`)
    }

    let selectedSortImages = document.querySelector(`#${table.getAttribute("id")} th:nth-of-type(${n + 1})>button>img`)
    for(img of sortImages){
        img.setAttribute("src", "static/images/sort_arrow.svg")
        img.setAttribute("alt", "")
    }
    // Run loop until no switching is needed
    while (switching) {
        switching = false;
        let rows = tableBody.getElementsByTagName(recordRowType);
        let sortLogicAscending
        let sortLogicDescending
        //Loop to go through all rows
        let Switch = false;
        for (i = 0; i < (rows.length - 1); i++) {
            // Fetch 2 elements that need to be compared
            if(recordRowType == "tr"){
                x = rows[i].children[n];
                y = rows[i + 1].children[n];
            }
            //Target the tbody's first row and get the column
            else{
                x = rows[i].firstElementChild.children[n]
                y = rows[i + 1].firstElementChild.children[n]
            }
            switch(typeOfSort){
                case "text":
                    sortLogicAscending  = x.textContent.toLowerCase() > y.textContent.toLowerCase()
                    sortLogicDescending = x.textContent.toLowerCase() < y.textContent.toLowerCase()
                    break
                case "date":
                    sortLogicAscending = sortDateLogic(x.innerHTML, y.innerHTML, true)
                    sortLogicDescending = sortDateLogic(x.innerHTML, y.innerHTML, false)
                    break
                case "fileSize":
                    sortLogicAscending = parseInt(x.innerHTML.split(" ")[0]) > parseInt(y.innerHTML.split(" ")[0])
                    sortLogicDescending = parseInt(x.innerHTML.split(" ")[0]) < parseInt(y.innerHTML.split(" ")[0])
                    break
                case "tabularOnly":
                    sortLogicAscending = x.getAttribute('value') == 'false' && y.getAttribute('value') == 'true'
                    sortLogicDescending = x.getAttribute('value') == 'true' && y.getAttribute('value') == 'false'
                case "versionCheck":
                    sortLogicAscending = x.getAttribute('value') > y.getAttribute('value')
                    sortLogicDescending = x.getAttribute('value') < y.getAttribute('value')
            }
            // Check the direction of order
            if (direction == "ascending") {
                if(sortLogicAscending)
                // Check if 2 rows need to be switched
                {
                    // If yes, mark Switch as needed and break loop
                    Switch = true;
                    break;
                }
            } else if (direction == "descending") {
                // Check direction
                if(sortLogicDescending)
                    {
                    // If yes, mark Switch as needed and break loop
                    Switch = true;
                    break;
                }
            }
        }
        if (Switch) {
            // Function to switch rows and mark switch as completed
            rows[i].parentNode.insertBefore(rows[i + 1], rows[i]);
            switching = true;

            // Increase count for each switch
            count++;
        } else {
            // Run while loop again for descending order
            if (count == 0 && direction == "ascending") {
                direction = "descending";
                switching = true;
            }
        }
    }
    //Change Icon here
    if(direction == "ascending"){
        selectedSortImages.setAttribute("src", "static/images/arrow_downward.svg")
        selectedSortImages.setAttribute("alt", "")
    }
    else if(direction == "descending"){
        selectedSortImages.setAttribute("src", "static/images/arrow_upward.svg")
        selectedSortImages.setAttribute("alt", "")
    }
}

/***************End Sort logic***********************/

/***************End Table Functions*********************/

// This class contains all the necessary pieces to create a progress screen for either the import or delete actions
class ProgressDisplay {
    constructor() {
        this.progressBarSuccess = document.getElementById('progressBarSuccess')
        this.progressBarFail = document.getElementById('progressBarFail')
        this.progressTitle = document.getElementById('progressTitle')
        this.progressCounterMessage = document.getElementById('progressCounterMessage')
        this.progressListButtonText = document.getElementById('progressListButtonText')
        this.progressText = document.getElementById("progressText")
        this.progressContainer = document.getElementById("progressScreenContainer")
        this.progressList = document.getElementById("progressList")
        this.closeProgressModal = document.getElementById("closeProgressModal")
        this.progressListButton = document.getElementById("progressListButton")
        this.stopProgressButton = document.getElementById("stopProgress")
        this.errorDiv = document.getElementById("progressErrorDiv")
        this.toggleErrovDiv = document.getElementById("toggleProgressErrorDiv")
        this.timerDisplay = document.getElementById("timerCount")
    }

    progressScreenSetup(subfolders, action) {
        //Reset the display for loaded message and loading screen
        this.progressContainer.removeAttribute("style")
        this.stopProgressButton.removeAttribute("style")
        this.closeProgressModal.setAttribute("style", "display:none;")
        this.progressListButton.setAttribute("style", "display:none;")
        this.progressList.classList.remove("show")
        this.progressList.innerHTML = ""
        //Reset loading bar
        this.progressBarSuccess.classList.remove('bg-info')
        this.progressBarSuccess.setAttribute('style', 'width:2%')
        this.progressBarSuccess.setAttribute('aria-valuenow', '0')
        this.progressBarSuccess.setAttribute('aria-valuemax', `${subfolders.length}`)
        this.progressBarSuccess.classList.add("progress-bar-animated", "progress-bar-striped")
        this.progressBarSuccess.classList.remove("bg-danger", "bg-success")
        //Reset failed loading bar
        this.progressBarFail.setAttribute('style', 'width:0%')
        this.progressBarFail.setAttribute('aria-valuenow', '0')
        this.progressBarFail.setAttribute('aria-valuemax', `${subfolders.length}`)
        this.progressBarFail.classList.add("progress-bar-animated")
        //Reset Error messages
        this.errorDiv.innerHTML = ""
        this.toggleErrovDiv.setAttribute("style", "display:none;")
        this.errorDiv.classList.remove("show")
        //Set the StopProgress buttons onClick function to include the action (either 'import' or 'delete')
        this.stopProgressButton.setAttribute("onClick", `stoppingProgress('${action}')`)
        //Set Progress Screen Image
        if (action == 'import') {
            document.getElementById('progressImgImport').removeAttribute('hidden')
            document.getElementById('progressImgDelete').setAttribute('hidden', '')
        } else {
            document.getElementById('progressImgDelete').removeAttribute('hidden')
            document.getElementById('progressImgImport').setAttribute('hidden', '')
        }
    }

    startTimer(element){
        this.timerDisplay.innerHTML = "00:00:00"
        var startTime = Date.now()
        this.timerDisplay = setInterval(function(){
            element.innerHTML = formatTime(Date.now() - startTime)
        },
        1000)
    }

    stopTimer() {
        clearInterval(this.timerDisplay)
    }

    /**Halts the loading style and change bar to green. Only applies to the success bar. */
    stopProgressBarSuccess(){
        this.progressBarSuccess.classList.remove("progress-bar-animated", "progress-bar-striped")
        this.progressBarSuccess.classList.add("bg-success")
    }

    /**Halts the loading style and change bar to green. Only applies to the success bar.*/
    stopProgressBarFail(){
        this.progressBarSuccess.classList.remove("progress-bar-animated", "progress-bar-striped")
        this.progressBarSuccess.classList.add("bg-danger")
    }
}

class sdvLoadingDisplay extends ProgressDisplay{
    /**Pass native js objects as parameters. CLASS FUNCTIONS WILL NOT WORK WITH JQUERY */
    constructor(backgroundScreen, parentDiv, resultsPage, header, loadingBar, timerDisplay, button, displayRatingResultsBtn, message){
        super()
        this.backgroundScreen = backgroundScreen
        this.parentDiv = parentDiv 
        this.resultsPage = resultsPage
        this.header = header
        this.loadingBar = loadingBar
        this.timerDisplay = timerDisplay
        this.button = button
        this.displayRatingResultsBtn = displayRatingResultsBtn
        this.message = message
    }

    startLoadingScreen(headerText, mainBtnText) {
        this.parentDiv.attributes.ariaHidden = false
        this.header.innerText = headerText
        this.button.innerText = mainBtnText
        this.button.style.display = "none"
        this.message.innerText = ""
        this.loadingBar.setAttribute("class", "progress-bar progress-bar-striped progress-bar-animated")
        this.loadingBar.innerHTML = "<span>Loading...</span>"
        this.startTimer(this.timerDisplay)
        $(`#${this.parentDiv.id}`).show()        
        this.header.focus()
        $(`#${this.backgroundScreen.id}`).hide()

    }

    finishLoading(headerText, mainBtnText, loadingBarText, colorClass, message){
        this.stopTimer()
        this.header.innerText = headerText
        this.button.innerText = mainBtnText
        //TODO: Remove this setting when cancel logic is implemented and replace with the close display logic
        this.button.style.display = "block"
        this.button.focus()
        this.loadingBar.classList.remove("progress-bar-striped", "progress-bar-animated")
        this.loadingBar.classList.add(colorClass)
        if(message != undefined){this.message.innerHTML = message}
        this.loadingBar.innerHTML = `<span>${loadingBarText}</span>` 
    }

    closeLoadingScreen(itemToFocusId){
        this.parentDiv.attributes.ariaHidden = true
        //this.backgroundScreen.attributes.ariaHidden = false
        if(showSdvResultsFlag){
            this.displayRatingResultsBtn.attributes.ariaHidden = false
            $(`#${this.resultsPage.id}, #${this.displayRatingResultsBtn.id}, #${this.parentDiv.id}`).toggle()
        }
        else{
            document.getElementById("homePageContainer").attributes.ariaHidden = false
            $(`#homePageContainer, #${this.parentDiv.id}`).toggle()
        }
        $(`#${itemToFocusId}`).focus()
    }
}
/**Populates the text in the toggleProgressErrorDiv*/
function populateFailedProgressMessage(failedAreas, action){
    // call progressDisplay class constructor to define elements
    let progressDisplay = new ProgressDisplay()
    if (progressDisplay.toggleErrovDiv.hasChildNodes()) {
        while (progressDisplay.toggleErrovDiv.firstChild) {
            progressDisplay.toggleErrovDiv.firstChild.remove(); 
        }
    }
    let actionValue = action == 'import' ? "import" : "delete" // using a ternary operator
    
    let alertMessage = `${Object.keys(failedAreas).length} areas have failed ${actionValue}.`
    populateAlertBtnAccordions("error", alertMessage, progressDisplay.toggleErrovDiv) 
}

/**Populates a list of successfully imported/deleted areas on the progress screen*/
function populateSuccessfulProgressMessage(loadedAreas, action){
    // call progressDisplay class constructor to define elements
    let progressDisplay = new ProgressDisplay()
    //set attributes
    progressDisplay.closeProgressModal.removeAttribute("style")
    if(loadedAreas.length > 0){
        progressDisplay.progressListButton.removeAttribute("style")
    }
    progressDisplay.stopProgressButton.setAttribute("style", "display:none;")
    progressDisplay.progressList.innerHTML = ""
    for(folder in loadedAreas){
        let actionValue = action == 'import' ? "imported" : "deleted" // using a ternary operator
        let alertMessage = `${loadedAreas[folder]} successfully ${actionValue}.` // need to swap between import/delete wording
        populateAlertBtnAccordions("success", alertMessage, progressDisplay.progressList)
    }
}

function stoppingProgress(action){
    // call progressDisplay class constructor to define elements
    let progressDisplay = new ProgressDisplay()
    progressDisplay.progressBarSuccess.setAttribute('style', 'width:100%;')
    progressDisplay.progressBarSuccess.classList.add("bg-info")
    progressDisplay.progressTitle.innerHTML = `Stopping ${action}...`
    stopProgress = true
}

async function enableDisableAdvancedImportOptions() {
    generateRasterChecked = document.getElementById('generateRaster').checked
    overrideGridSizeInput = document.getElementById('override-grid-size-form')
    if (generateRasterChecked) {
        overrideGridSizeInput.style.display = "block"
    } else {
        overrideGridSizeInput.style.display = "none"
    }
}

/**A method that checks if the user is trying to import duplicate areasymbols. It takes a list of import candidates and checks it against duplicateSSAs */
function checkForDuplicateSSA(importCandidates){
    let modalBody = document.getElementById("duplicateSSAModalMessage")
    modalBody.innerHTML = ""
    for(const i in Object.keys(duplicateSSAs)){
        let areaSymbol = Object.keys(duplicateSSAs)[i]
        let duplicateSSAFolder = Object.values(duplicateSSAs)[i]
        let duplicateList = importCandidates.filter(function(e) {
            return duplicateSSAFolder.includes(e)
        })
        if(duplicateList.length > 1){
            modalBody.innerHTML = `<p>The areasymbol <b>${areaSymbol}</b> is found in the following selected folders: <b>${duplicateList.join(", ")}</b>.</p>`
        }
    }
    if(modalBody.innerHTML != ""){
        document.getElementById('duplicateSSABtn').click()
        return true
    }
    else{
        return false
    }
}

/**Create a promise that listens for a button click on two buttons */
async function awaitUserInput(cancelButtonId, continueButtonId){
    let cancelButton = document.getElementById(cancelButtonId)
    let continueButton = document.getElementById(continueButtonId)
    function buildPromise(){
        let decisionMade = new Promise((resolve) => {
            continueButton.addEventListener("click", function(){
                resolve(true)
            })
            cancelButton.addEventListener("click", function(){
                resolve(false)
            })
        })
        return decisionMade
    }
    let promise = buildPromise()
    let promiseResult = await promise
    return promiseResult
}

async function checkForDifferentDataSource(subfolders){
    let dataSourceItems = {}
    let continueImport
    for(let idx in importTable.data) {
        let folderName = importTable.data[idx].childfoldername
        let dataSource = importTable.data[idx].datasource
        if(subfolders.includes(folderName)) {
            if(dataSource in dataSourceItems) {
                dataSourceItems[dataSource] += 1
            } else {
                dataSourceItems[dataSource] = 1
            }
        }
    }

    let dbTableSources = databaseTable.dbStatus
    let selectedDataSources = Object.keys(dataSourceItems)
    if(selectedDataSources.length == 1) {
        if(selectedDataSources[0] == dbTableSources || dbTableSources == 'EMPTY') {
            return true
        }
    } 
    document.getElementById('differentDataSourceBtn').click()
    let modalBody = document.getElementById("differentDataSourceModalMessage")
    modalBody.innerHTML = 'Both SSURGO and STATSGO2 data will be in the database if imported. Having both soil data products can lead to overlapping data which may cause errors. If this is intended, you can proceed. To avoid the possibility of overlapping data, it is recommended to store different data types in separate databases.'
    continueImport = await awaitUserInput("cancelDiffDataImport", "continueDiffDataImport")
    document.getElementById('closeDifferentDataSourceModalBtn').click()
    return continueImport
}

async function checkForExistingSSA(){
    let existingCheckboxItems = []
    let continueImport
    for(let checkbox in importTable.selectedCheckboxes){
        if(document.getElementById(`importCheckbox${importTable.selectedCheckboxes[checkbox]}`).parentNode.parentNode.children.item(6).innerText != ""){
            existingCheckboxItems.push(importTable.selectedCheckboxes[checkbox])
        }

    }
    if(existingCheckboxItems.length > 0){
        document.getElementById('existingSSABtn').click()
        let modalBody = document.getElementById("existingSSAModalMessage")
        if(existingCheckboxItems.length > 1){
            modalBody.innerHTML = `These folders contain areasymbol(s) that are already in the database: ${existingCheckboxItems.join(", ")}.`
        }
        else{
            modalBody.innerHTML = `This folder contains areasymbol(s) that are already in the database: ${existingCheckboxItems}.`
        }
        continueImport = await awaitUserInput("cancelExistingImport", "continueExistingImport")
        return continueImport
    }
    return true
}

async function deleteDatabaseWarning(){
    let continueImport
    if(databaseTable.selectedCheckboxes.length == databaseTable.totalRows){
        document.getElementById('deleteWarningModalBtn').click()
        let modalBody = document.getElementById("deleteDatabaseMessage")
        modalBody.innerHTML = "You are getting ready to delete all of the Area Symbols in your database: " + databaseName
        continueImport = await awaitUserInput("cancelDelete", "continueDelete")
        return continueImport
    }
    return true
}

function setDatabaseName(path){
    databaseName = path.split('/')
    databaseName = databaseName[databaseName.length-1]
    $("#selectedDatabaseNameLeftPane").text(databaseName)
    $("#selectDatabasePage, #homePageContainer").toggle();
    //USWDS takes the title attribute, removes it, and takes the value to created the tooltip.
    //To update the tooltip, we must select it directly. This updates the tooltip path with the selected database path using the OS path separator.
    $("#getUserDatabaseModal>span:first-of-type>span").text(osPathSep == "\\" ? databasePath.replaceAll("/", "\\") : databasePath)    
    $("#selectDatabaseBrowseBtn").focus()
    document.getElementById("selectedFolderNameBrowseBtn").disabled = false
}

function setFolderName(path){
    let folderName = path.split('/')
    if(folderName[folderName.length -1] == ""){
        folderName.pop()
    }
    folderName = folderName[folderName.length-1]
    document.getElementById('selectedFolderNameTitle').innerHTML = "Change Folder of SSURGO Data"
    // start change Selected Folder Name tooltip
    let selectedFolderName = document.getElementById('selectedFolderName')
    if(selectedFolderName){
        selectedFolderName.nextElementSibling.innerHTML = "Click “Browse” to select a different folder of SSURGO data."
    }    
    // end change Selected Folder Name tooltip
    document.getElementById('selectedFolderNameBrowseBtn').title = "Click “Browse” to select a different folder of SSURGO data."
    if(selectedFolderName){
        document.getElementById('selectedFolderName').setAttribute('placeholder', folderName)
    }
    
}

// Gets the Database Template Catalog from the config file by executing the 'getTemplateCatalog' request
async function getDatabaseTemplateCatalog() {
    var templateCatalogRequest = {'request' : getTemplateCatalogRequest}
    sendData(templateCatalogRequest)
}

/**Iterate through the template config options stored in 'emptyTemplates' & populate Database Type Dropdown menu*/
async function populateDatabaseTypeDropdown(){
    var showTextTemplates = document.getElementById('textTemplatesCheckbox').checked
    var templateOptions = document.getElementById('templateTypeDropdown')
    templateOptions.innerHTML = ""
    if (!emptyTemplates || Object.keys(emptyTemplates).length === 0) {
        await getDatabaseTemplateCatalog()
    }
    if (!emptyTemplates || Object.keys(emptyTemplates).length === 0) {
        let errorMessageElement = document.getElementById("createNewDatabaseErrorMessage")
        errorMessageElement.textContent = "Unable to load database templates. Please try again."
        errorMessageElement.classList.remove("hidden")
        return
    }
    for (let template in emptyTemplates)
    {
        const option = document.createElement('option')
        if (showTextTemplates) {
            if (emptyTemplates[template].textTemplate == true) {
                option.value = emptyTemplates[template].path
                option.ariaLabel = template
                option.innerHTML = template
                templateOptions.appendChild(option)
            }
        } else {
            if (emptyTemplates[template].textTemplate == false) {
                option.value = emptyTemplates[template].path
                option.ariaLabel = template
                option.innerHTML = template
                templateOptions.appendChild(option)
            }
        }
    }
    document.getElementById("toggleCreateNewDBModal").click()
    // Calls displayNewDatabasePath() everytime the "Create New Database" button is clicked
    displayNewDatabasePath();
}

function normalizeDirectoryForDatabaseCreation(pathValue) {
    let normalizedPath = String(pathValue ?? '').trim().replaceAll('\\', '/')
    if (!normalizedPath) {
        return ''
    }

    normalizedPath = normalizedPath.replace(/\/+$/, '')

    // If the user selected an existing DB file, create new DB beside it (in parent folder).
    const configuredExtensions = emptyTemplates && typeof emptyTemplates === 'object'
        ? Object.values(emptyTemplates)
            .map(template => String(template?.suffix ?? '').toLowerCase())
            .filter(suffix => suffix.startsWith('.'))
        : []
    const knownDbSuffixes = new Set(['.gpkg', '.sqlite', ...configuredExtensions])

    const lowerPath = normalizedPath.toLowerCase()
    const isDatabaseFilePath = Array.from(knownDbSuffixes).some(suffix => lowerPath.endsWith(suffix))
    if (!isDatabaseFilePath) {
        return normalizedPath
    }

    const parentPath = normalizedPath.split('/').slice(0, -1).join('/')
    return parentPath || normalizedPath
}

/**Issue a check against various different criteria to determine if a user should be allowed to click the save button.
 * Depending on these checks, the UI will be updated to warn and disable or allow saving. */
async function allowUserSaveDatabase(databaseRootPath, databaseDisplayPath){
    let createNewDatabaseLocation = document.getElementById('createNewDatabaseLocation');
    let preventDbCreationContainer = document.getElementById('preventDbCreationContainer');
    let createNewDbBtn = document.getElementById("createNewDbBtn");
    let createNewDatabaseName = document.getElementById('createNewDatabaseName').value
    let folderContents
    //Check to see if the folder we are in ends with "_gpkg" or "_sqlite". If true, do not allow the user to save
    let inDatabaseFolder = databaseRootPath.split(/[\\/]+/).slice(-2, -1).toString()
    inDatabaseFolder = inDatabaseFolder.includes("_gpkg") || inDatabaseFolder.includes("_sqlite")
    let folderHasContents = false
    //If we are in a _gpkg or _sqlite folder or if the database name is blank, we do not need to send other checks. 
    if(!inDatabaseFolder || createNewDatabaseName == ""){
        var goodPath = await continuePathNavigation(databaseTreeViewTableId, databaseRootPath.split(/[\/\\]+/).slice(0, -1).join("/"), false, "", true)
        if(!goodPath){
            return
        }
        let folderContentsRequest = {'request': getFolderTreeRequest, 'path': databaseRootPath, 'folderpattern' : `.*.*`, 'ignorefoldercase': true,
        'filepattern' : `.*.*`, 'ignorefilecase': true, 'showfiles': true, 'maxdepth': 1}
        folderContents = await fetch(url, {
            method : 'POST',
            headers: {'Content-Type' : 'application/json'},
            body: JSON.stringify(folderContentsRequest)}
        ).then(response => response.json()
        ).then(function(response){return response})

        folderHasContents = Array.isArray(folderContents?.nodes)
            ? folderContents.nodes.length > 0
            : Boolean(folderContents?.nodes)
    }
    preventDbCreationContainer.setAttribute('style', 'display: none') //Reset hide display preventDbCreationContainer
    if(inDatabaseFolder || createNewDatabaseName == "" || !goodPath || folderHasContents ) { //Database already exists or folder contains data
        createNewDatabaseLocation.innerHTML = databaseDisplayPath;
        createNewDatabaseLocation.setAttribute('style', 'color: #E90000; font-weight: bold;') //Change text to red & bold to pass 508
        preventDbCreationContainer.setAttribute('style', 'display: block') //Display preventDbCreationContainer
    }
    else { //The folder doesnt contain any data and the database does not exist.
        createNewDatabaseLocation.innerHTML = databaseDisplayPath;
        createNewDatabaseLocation.setAttribute('style', 'color: #000000; font-weight: normal;') //Change text to black
    }
    //Disable "Save Button" the database name is empty, the database already exists, or the folder contains other data
    if(inDatabaseFolder || createNewDatabaseName == "" || !goodPath || folderHasContents){
        createNewDbBtn.disabled = true
        return false
    }
    else{
        createNewDbBtn.disabled = false
        return true
    }
}

/**Concatenates the user's directory, database name & extension and then displays it to the user when creating a new DB*/
async function displayNewDatabasePath() {
    // Directory where database will be created
    let userDirectory = updatedValue('databaseTextBox');

    // DB Name
    let createNewDatabaseName = updatedValue('createNewDatabaseName');

    // DB Extension
    let templateValue = document.getElementById('templateTypeDropdown');
    let extension = "";

    //DB Error Message
    let errorMessageElement = document.getElementById("createNewDatabaseErrorMessage")
    errorMessageElement.innerHTML = ""

    if (templateValue != null)
    {
        if (templateValue.options[templateValue.selectedIndex] != undefined)
        {
            let selectedTemplate = templateValue.options[templateValue.selectedIndex].text;
            extension = emptyTemplates[selectedTemplate].suffix;
        }
    }
    userDirectory = normalizeDirectoryForDatabaseCreation(userDirectory)

    const databasePathInput = document.getElementById('databaseTextBox')
    if (databasePathInput) {
        databasePathInput.value = userDirectory.replaceAll('/', osPathSep)
    }

    //Standardize the file path presented
    userDirectory = userDirectory.split("/")
    userDirectory = userDirectory.join(osPathSep)
    let folderSuffix = extension.replaceAll(".", "_")
    let databaseRootPath
    // Build out full path & display it to the user. Also sets the databasePath global Variable
    if(userDirectory.endsWith("\\") || userDirectory.endsWith("/")){
        databaseRootPath = `${userDirectory}${createNewDatabaseName}${folderSuffix}`
        var newDatabaseCreationDisplay = `${databaseRootPath}${osPathSep}${createNewDatabaseName}${extension}`;
    }
    else{
        databaseRootPath = `${userDirectory}${osPathSep}${createNewDatabaseName}${folderSuffix}`
        var newDatabaseCreationDisplay = `${databaseRootPath}${osPathSep}${createNewDatabaseName}${extension}`;
    }

    allowUserSaveDatabase(databaseRootPath, newDatabaseCreationDisplay)
}

/**Creates a new template database at the location the user picks*/
async function createNewTemplateDatabase(template, destinationFolder, dbName, overwrite = overwriteChecked) {
    let templateValue = document.getElementById(template);
    let selectedTemplate = templateValue.options[templateValue.selectedIndex].text;
    let extension = emptyTemplates[selectedTemplate].suffix;
    let folderPathSuffix = extension.replaceAll(".", "_")
    let dbNameValue = document.getElementById(dbName).value;
    let destinationRootValue = normalizeDirectoryForDatabaseCreation(document.getElementById(destinationFolder).value)
    let destinationFolderValue = `${destinationRootValue}/${dbNameValue}${folderPathSuffix}`;
    let errorMessageElement = document.getElementById("createNewDatabaseErrorMessage")

    document.getElementById(destinationFolder).value = destinationRootValue.replaceAll('/', osPathSep)

    destinationFolderValue = destinationFolderValue.replaceAll("\\", "/") //Send folder path using / to prevent errors on the python side
    databasePath = destinationFolderValue + "/" + dbNameValue + extension; //set the global databasePath variable
    let allowUserToSave = await allowUserSaveDatabase(destinationFolderValue, `${destinationFolderValue.replaceAll("/", osPathSep)}${osPathSep}${dbNameValue}${extension}`)
    if(allowUserToSave){
        BrowserStorage.setLocalStorage(databaseTableRequest, destinationFolderValue)

        var createNewDatabase = {'request' : copyTemplateFileRequest, 'templatename' : selectedTemplate, 'folder' : destinationFolderValue,
            'filename' : dbNameValue, 'overwrite' : overwrite}
        let response = await sendData(createNewDatabase) // Creates new Database
        //Check status of response.
        if (response && response.status) {
            selectDatabase(destinationFolderValue, databasePath) // Sets newly created database as the Selected Database
            document.getElementById('helpPaneContainer').setAttribute("style", "display: none") //close the help menu if it was open before navigating away
            if(document.getElementById("createNewDatabaseModal").classList.contains("is-visible")){
                document.getElementById("toggleCreateNewDBModal").click()
            }
        }
        //Populate error message on createNewDatabaseModal
        else{
            errorMessageElement.innerHTML = ""
            let i = document.createElement("i")
            i.innerText = response && response.errormessage ? response.errormessage.replaceAll("/", "\\") : "Unknown error was experienced. Please try again."
            errorMessageElement.appendChild(i)
        }
    }
}

/********************************************SDV Logic**************************************/  
class sdvAttributeRules{
    constructor(aggregationRuleResponse){
        this.attributetablename = aggregationRuleResponse["attributetablename"]
        this.attributecolumnname = aggregationRuleResponse["attributecolumnname"]
        this.attributetype = aggregationRuleResponse["attributetype"]
        this.attributeprecision = aggregationRuleResponse['attributeprecision']
        this.ruledesign = aggregationRuleResponse["ruledesign(2)"]
        this.tiebreakdomainname = aggregationRuleResponse["tiebreakdomainname"]
        this.complevelattribflag = aggregationRuleResponse["complevelattribflag"]
        this.attributelogicaldatatype = aggregationRuleResponse["attributelogicaldatatype"]
        this.sqlwhereclause = aggregationRuleResponse["sqlwhereclause"]
        this.primaryconcolname = aggregationRuleResponse["primaryconcolname"]
        this.pcclogicaldatatype = aggregationRuleResponse["pcclogicaldatatype"]
        this.secondaryconcolname = aggregationRuleResponse["secondaryconcolname"]
        this.scclogicaldatatype = aggregationRuleResponse["scclogicaldatatype"]
        this.nasisrulename = aggregationRuleResponse["nasisrulename"]
        this.cmonthlevelattribflag = aggregationRuleResponse["cmonthlevelattribflag"]
        this.horzlevelattribflag = aggregationRuleResponse["horzlevelattribflag"]
        this.horzaggmeth = aggregationRuleResponse["horzaggmeth"]
        this.effectivelogicaldatatype = aggregationRuleResponse["effectivelogicaldatatype"] 
    }
}

class sdvAggregationParams{
    constructor(){
        this.attributename = ($("#aggregationName").text() === undefined ? null : $("#aggregationName").text()) 
        this.primaryconstraint = ($("#comboBoxInputFieldId").val() === undefined) ? null : $("#comboBoxInputFieldId").val() //Primary basic options
        //Check to see if either the dropdown or textbox exists. If textbox visible, take that value, otherwise, if dropdown visible, take that value
        this.secondaryconstraint = ($("#secondaryOptionTextId").val() === undefined && $("#secondaryConstraintDropdownId").val() === undefined) ? null :
            ($("#secondaryOptionTextId").is(":visible")) ? $("#secondaryOptionTextId").text() : $("#secondaryConstraintDropdownId").val() //Secondary basic options
        this.aggregationmethod = ($("#aggregationMethodDropdownId").val() === undefined) ? null : $("#aggregationMethodDropdownId").val().toLowerCase()
        this.componentpercentagecutoff = ($("#compPercentCutoffId").val() === undefined ? null : 
            $("#compPercentCutoffId").val() === '') ? null : parseInt($("#compPercentCutoffId").val()) 
        this.tiebreakrule = ($("#tieBreakLower").is(":checked") === true) ? $("#tieBreakLower")[0].tieBreakValue : $("#tieBreakHigher")[0].tieBreakValue
        this.interpretnullsaszero = (($("#interpNullAsZerotrue").val() === undefined) ? false :
            ($("#interpNullAsZerotrue").is(":checked") === true) ? $("#interpNullAsZerotrue")[0].interpNullValue : $("#interpNullAsZerofalse")[0].interpNullValue) //Else grab the value of the radio buttons
        this.layers = ($("input:radio.layerOptions:checked").val() === undefined) ? null : $("input:radio.layerOptions:checked").val().toLowerCase()
        this.depthtop = (this.layers !== 'depth range') ? null : parseInt($("#topDepthInputId").val())
        this.depthbot = (this.layers !== 'depth range') ? null : parseInt($("#bottomDepthInputId").val())
        this.depthuom = (this.layers !== 'depth range') ? null : $("input:radio.depthRangeInputs:checked").val()
        this.monthbeg = ($("#beginningMonthDropdown").val() === undefined) ? null : $("#beginningMonthDropdown").val().toLowerCase()
        this.monthend = ($("#endingMonthDropdown").val() === undefined) ? null : $("#endingMonthDropdown").val().toLowerCase()
    }
}

document.getElementById("sdvSearchText").addEventListener("keyup", (e) => {searchUserInput(e)})

/**Takes user SDV rating options search input and displays relevant rating option results*/
async function searchUserInput(e) {
    if(e.key === "Tab") {
        return
    }
    await delay(500)
    var sdvSearchInput = document.getElementById("sdvSearchText").value
    if (sdvSearchInput == "") { 
        getSDVAttributesByFolder()
    }
    
    const sdvFolderNameList = document.querySelectorAll(".sdvListAccordion");
    sdvSearchInput = sdvSearchInput.trim().toLowerCase()
    
    sdvFolderNameList.forEach((sdvListItem) => {
        var sdvListAccordionElem = document.getElementById(sdvListItem.id)
        var sdvRatingOptionList = sdvListAccordionElem.querySelectorAll(".sdvListAttribute")
        var hasInner = false

        let elemSdvFolderListItem = sdvListItem.querySelector(".sdvFolderListItem")
        let elemSdvAttribute = sdvListItem.querySelector(".sdvAttributesList")

        if (sdvListAccordionElem.firstElementChild.innerHTML.toLowerCase().includes(sdvSearchInput)) {
            // if user input search is in SDV folder name 
            sdvListAccordionElem.style.display = "block"
            sdvRatingOptionList.forEach((sdvRatingOptionItem) => {
                sdvRatingOptionItem.style.display = "block" 
                elemSdvFolderListItem.setAttribute("aria-expanded", "false")
                elemSdvAttribute.setAttribute("hidden", "true")
            })
        } else { 
            // if user input search is NOT in SDV folder name 
            // search rating options in accordion: 
            sdvRatingOptionList.forEach((sdvRatingOptionItem) => {
                if (sdvRatingOptionItem.firstElementChild.innerText.toLowerCase().includes(sdvSearchInput)) {
                    // if user search input is in adv attribute name 
                    hasInner = true
                    sdvRatingOptionItem.style.display = "block"
                    sdvListAccordionElem.style.display = "block"

                    elemSdvFolderListItem.setAttribute("aria-expanded", "true")
                    elemSdvAttribute.removeAttribute("hidden")

                } else {
                    //  user search input is not in sdv attribute name AND not in SDV folder name  
                    sdvRatingOptionItem.style.display = "none"
                    if (hasInner == false) {
                        sdvListAccordionElem.style.display = "none"
                    } 
                }
            })
        }
    });
}

/**Returns a list of SDV Attributes nested by SDV Folder*/
async function getSDVAttributesByFolder() {
    var sdvAttributesByFolderRequest = {'request' : getSDVAttributesByFolderRequest, 'database' : databasePath}
    let response = await sendData(sdvAttributesByFolderRequest)
    if(response && response.recordlist){
        populateSdvFolders(response.recordlist)
    }
}

/**Populates the left pane menu with the SDV Folder list under the 'Soil Data Viewer' tab*/
function populateSdvFolders(sdvAttributesByFolders) {
    var sdvFolderList = document.getElementById("SDVFolderList")
    //clear out elements to always start fresh after selecting a database
    sdvFolderList.innerHTML = ""
    // $("#sdvRatingOptions").hide()
    // document.getElementById("requiredOptionsBody").innerHTML = ""
    // document.getElementById("sdvAdvancedOptionsBody").innerHTML = ""

    if (!sdvAttributesByFolders === undefined || !sdvAttributesByFolders.length == 0) {
        for (let sdvFolder in sdvAttributesByFolders) {
            // Create an unordered list, list item, and button
            let sdvSubFolderList = document.createElement('ul')
            let listItem = document.createElement('li')
            Object.assign(listItem, {
                classList: 'usa-accordion sdvListAccordion',
                id: `sdv-list-accordion-${sdvFolder}`,
            })
            let folderButton = document.createElement('button')
            listItem.appendChild(folderButton)
            let sdvAttributesListId = 'sdvAttributesList' + sdvFolder
            Object.assign(folderButton, {
                type: 'button',
                innerHTML: sdvAttributesByFolders[sdvFolder]["foldername"],
                classList: 'usa-accordion__button sdvFolderListItem',
                // sdvFolderListItem: rating option category name/header 
                id: `sdv-folder-id-${sdvFolder}`,
                ariaExpanded: 'false',
            })
            folderButton.setAttribute('aria-controls', sdvAttributesListId)
            Object.assign(sdvSubFolderList, {
                id: sdvAttributesListId,
                classList: 'usa-accordion__content sdvAttributesList',
                hidden: true,
            })

            let newDisplayedFolderDescription = sdvAttributesByFolders[sdvFolder]["folderdescription"]
            newDisplayedFolderDescription = newDisplayedFolderDescription.replace(/\s+/g, ' ').trim()
            let newDisplayedFolderName = sdvAttributesByFolders[sdvFolder]["foldername"]
            // GETTING FOLDER DESCRIPTION AND NAME
            folderButton.setAttribute('description', newDisplayedFolderDescription)
            folderButton.setAttribute('name', newDisplayedFolderName)
            folderButton.setAttribute('attributeKey', "")
            folderButton.addEventListener("click", (e) => {placeData(e)})

            $(".listedAttributeItem").click(function () {
                $(this).ariaExpanded = $(this).ariaExpanded !== 'true';
                $(this).hidden = false;
            });

            if (sdvAttributesByFolders[sdvFolder]["attributes"].length > 0) {
                for (let sdvAttribute in sdvAttributesByFolders[sdvFolder]["attributes"]) {
                    let sdvAttributesList = document.createElement('li')
                    let attributeListItem = document.createElement('button')
                    let newDisplayedAttributeName = sdvAttributesByFolders[sdvFolder]["attributes"][sdvAttribute]["attributename"]
                    let attributeKey = sdvAttributesByFolders[sdvFolder]["attributes"][sdvAttribute]["attributekey"]
                    attributeListItem.innerText = newDisplayedAttributeName
                    attributeListItem.setAttribute('tabindex', '0')
                    attributeListItem.setAttribute('class', 'listedAttributeItem')
                    attributeListItem.setAttribute('folderName', newDisplayedFolderName)
                    // listedAttributeItem: individual rating option 
                    Object.assign(sdvAttributesList, {
                        classList: 'sdvListAttribute',
                        id: `sdv-li-attr-id-${sdvAttribute}`,
                    })
                    listItem.appendChild(sdvSubFolderList)
                    sdvSubFolderList.appendChild(sdvAttributesList)
                    sdvAttributesList.appendChild(attributeListItem)

                    let newDisplayedAttributeDescription = sdvAttributesByFolders[sdvFolder]["attributes"][sdvAttribute]["attributedescription"]
                    // Using regex to replace new lines and carraige returns with HTML line breaks for formatting, 
                    // then remove white space and double qoutes inside of strings
                    newDisplayedAttributeDescription = newDisplayedAttributeDescription.replace(/\"/g, "''").replace(/\r\n|\n|\r/g, '<br>').replace(/\"|\s+/g, ' ').trim()
                    attributeListItem.setAttribute('description', newDisplayedAttributeDescription)
                    attributeListItem.setAttribute('name', newDisplayedAttributeName)
                    attributeListItem.setAttribute('attributeKey', attributeKey)
                    attributeListItem.addEventListener("click", (e) => {placeData(e)})
                }
            }
            sdvFolderList.appendChild(listItem)
        }
    } else {
        let listItem = document.createElement('li')
        listItem.innerText = "No Folders Exist!"
        sdvFolderList.appendChild(listItem)
    }
}

/**This function places the SDV folder/attribute descriptions and name*/
async function placeData(event){
    let interpTypeName = $("#interpTypeName")
    let selectMsg = $("#sdvSelectMessage")
    let aggregationName = $("#aggregationName")
    let sdvFolderDescription = $("#sdvFolderDescription")
    let description = event.target.getAttribute('description')
    let folderOrAttributeName = event.target.getAttribute('name')
    let attributeKey = event.target.getAttribute('attributeKey')
    //Send a request off to the DL Core to reterive the SDV Rating Options
    //Executing this request/ calling the populateSdvRatingOptions() function from inside the placeData seems strange
    //This logic might get re-worked/ re-structured (moved out of placeData() in an upcoming story)
    if (attributeKey != '') {
        selectMsg.hide()        
        $("#sdvFolderDescription").hide()
        aggregationName.text(folderOrAttributeName)
        interpTypeName.text(event.target.getAttribute('folderName'))
        var sdvRatingOptionsRequest = {'request' : getSDVRatingOptions, 'database' : databasePath, 'attributekey' : attributeKey.toString()}
        let response = await sendData(sdvRatingOptionsRequest)
        if(response && response.sdvAttributeRecords[0]){
            aggregationRuleResponse = new sdvAttributeRules(response['sdvAttributeRecords'][0])
        }
        $("#ratingDescText").html(description)
        populateSdvRatingOptions(response)
        aggregationName.show()
        $("#sdvRatingOptions, #sdvRatingOptionsContainer").show()
        checkEnableViewData()
    } else {
        interpTypeName.text(folderOrAttributeName)
        $("#aggMethDesc, #ratingDescText").html("")
        $(".hideSdvDescription, #sdvRatingOptionsContainer").hide()
        aggregationName.hide()
        sdvFolderDescription.show()
        selectMsg.show()
        sdvFolderDescription.text(description)
        //If a folder is selected, clear the Rating Options Container and disable the view data button
        $("#viewDataBtn").prop('disabled', true)        
    }
}

function populateSdvRatingOptions(response)
{
    let attributeRecords = response.sdvAttributeRecords[0]
    let algorithmRecords = response.sdvAlgorithmRecords
    let basicOptionRecords = response.basicoptions
    let ratingOptionsContainer = document.getElementById('sdvRatingOptions')
    //let sdvAggregationDesc = document.getElementById('sdvRatingDescriptions')
    $("#requiredOptionsBody, #sdvAdvancedOptionsBody").html("")
    $("#sdvRequiredOptionsContainer, #sdvAdvancedOptionsContainer").hide()
    $("#ratingDesc, #sdvRatingOptions, #interpTypeDesc").show()

    //Group 1: Basic Options / Data Selection Options
    if (getAttributeValue(attributeRecords, 'primaryconcolname').length > 0 && basicOptionRecords != null) {
        if (typeof basicOptionRecords == "string") {
            let emptyDictMessage = document.createElement('p')
            emptyDictMessage.innerHTML = basicOptionRecords
            $("#requiredOptionsBody").append(emptyDictMessage)
            $("#sdvRequiredOptionsContainer").show()
            return;
        }
        
        //Create div & label for the entire Basic Options Control
        // Structure: basicOptionsDiv > primaryConstraintDropdownLabel
        //                            > basicOptionsComponent > primaryConstraintDropdown > options 
        let basicOptionsDiv = document.createElement('div')
        basicOptionsDiv.id = 'basicOptionsDivId'
        let basicOptionsComponent = document.createElement('div')
        basicOptionsComponent.id = 'basicOptionsComponentId'
        basicOptionsComponent.setAttribute('class', 'usa-combo-box')

        // <---------------start primary constraint section---------------> 

        //Create primary constraint fields - Create label and dropdown
        let primaryConstraintDropdown = document.createElement('select')
        primaryConstraintDropdown.setAttribute('tabindex', '-1')
        Object.assign(primaryConstraintDropdown, {
            id: 'primaryConstraintDropdownId',
            name: 'primaryConstraintDropdown',
            classList: 'usa-select usa-sr-only usa-combo-box__select',
            ariaHidden: 'true',
        })

        let primaryConstraintDropdownLabel = document.createElement('label')
        primaryConstraintDropdownLabel.setAttribute('for', 'comboBoxInputFieldId')
        Object.assign(primaryConstraintDropdownLabel, {
            id: 'primaryConstraintDropdownLabelId',
            classList: 'usa-label',
            innerHTML: `${attributeRecords.primaryconstraintlabel}:&nbsp`,
            ariaLabelledby: 'primaryConstraintDropdownLabel',
        })
        
        //Append the primary constraint options to dropdown list
        for (let val in basicOptionRecords) {
            let option = document.createElement('option')
            option.name = basicOptionRecords[val]['primaryconstraint']
            option.value = basicOptionRecords[val]['primaryconstraint']
            option.innerText = basicOptionRecords[val]['primaryconstraint']
            primaryConstraintDropdown.append(option)
        }

        basicOptionsComponent.append(primaryConstraintDropdown)
        basicOptionsDiv.append(primaryConstraintDropdownLabel)
        basicOptionsDiv.append(basicOptionsComponent)

        //Create USWDS Combo Box component 

        // Structure of components: (all in basicOptionsComponent div with 'usa-combo-box' class)
        //      <input> </input> 
        //      <span clear-input-wrapper> <button>clear input btn (x)</button> </span> 
        //      <span> separator </span>
        //      <span toggle-list-wrapper> <button>dropwdown arrow</button> </span>
        //      <ul combo-box-list> <li></li> <li></li> ... </ul>
        //      <div class='sr-only'> </div>
        //      <span>sr-only message</span>

        // create input - all add to basicOptionsComponent 
        let comboBoxInputField = document.createElement('input')
        Object.assign(comboBoxInputField, {
            id: 'comboBoxInputFieldId',
            name: 'comboBoxInputField',
            type: 'text',
            classList: 'usa-combo-box__input',
            role: 'combobox',
            ariaOwns: 'comboBoxDropdownListId', 
            ariaControls: 'comboBoxDropdownListId',
            ariaExpanded: 'false',
            ariaAutocomplete: 'list',
            ariaDescribedby: 'comboBoxInputField--assistiveHint',
            autocapitalize: 'off',
            autocomplete: 'off',
        })
        
        basicOptionsComponent.append(comboBoxInputField)

        // create span 
        let comboBoxClearInputWrapper = document.createElement('span')
        Object.assign(comboBoxClearInputWrapper, {
            id: 'comboBoxClearInputWrapperId',
            name: 'comboBoxClearInputWrapper',
            classList: 'usa-combo-box__clear-input__wrapper',
            tabindex: '-1',
        })
            // create btn 
        let comboBoxClearInputButton = document.createElement('button')
        Object.assign(comboBoxClearInputButton, {
            id: 'comboBoxClearInputButtonId',
            name: 'comboBoxClearInputButton',
            type: 'button',
            classList: 'usa-combo-box__clear-input',
            ariaLabel: 'Clear the select contents',
            value: '&nbsp;',
        })
        
        comboBoxClearInputWrapper.append(comboBoxClearInputButton)
        basicOptionsComponent.append(comboBoxClearInputWrapper)


        // create span - separator 
        let comboBoxSeparator = document.createElement('span')
        Object.assign(comboBoxSeparator, {
            id: 'comboBoxSeparatorId',
            name: 'comboBoxSeparator',
            classList: 'usa-combo-box__input-button-separator',
            value: '&nbsp;',
        })

        basicOptionsComponent.append(comboBoxSeparator)

        // create span 
        let comboBoxToggleListWrapper = document.createElement('span')
        Object.assign(comboBoxToggleListWrapper, {
            id: 'comboBoxToggleListWrapperId',
            name: 'comboBoxToggleListWrapper',
            classList: 'usa-combo-box__toggle-list__wrapper',
            tabindex: '-1',
        })
            // create button - dropdown icon 
        let comboBoxDropdownButton = document.createElement('button')
        Object.assign(comboBoxDropdownButton, {
            id: 'comboBoxDropdownButtonId',
            name: 'comboBoxDropdownButton',
            type: 'button',
            classList: 'usa-combo-box__toggle-list',
            ariaLabel: 'Toggle the dropdown list',
            value: '&nbsp;',
            tabindex: '-1',
        })
        
        comboBoxToggleListWrapper.append(comboBoxDropdownButton)
        basicOptionsComponent.append(comboBoxToggleListWrapper)
        
        // create ul 
        let comboBoxDropdownList = document.createElement('ul')
        Object.assign(comboBoxDropdownList, {
            id: 'comboBoxDropdownListId',
            name: 'comboBoxDropdownList',
            tabindex: '-1',
            classList: 'usa-combo-box__list',
            role: 'listbox',
            ariaLabelledby: 'Primary constraint label',
            hidden: 'hidden',
        })
            // for-loop <li> 
        //Append the primary constraint options to dropdown list
        for (let val in basicOptionRecords) {
            let comboBoxOption = document.createElement('li')
            let idx = `basicOptionRecords--option-${val}`
            val = basicOptionRecords[val]['primaryconstraint']
            Object.assign(comboBoxOption, {
                id: `comboBoxDropdownListId--option-${idx}`,
                name: val,
                value: val,
                innerText: val,
                classList: 'usa-combo-box__list-option',
                ariaSetsize: Object.keys(basicOptionRecords).length,
                ariaPosinset: idx+1,
                ariaSelected: 'false',
                role: 'option',
                dataValue: val,
            })
            comboBoxDropdownList.append(comboBoxOption)
        }
        
        basicOptionsComponent.append(comboBoxDropdownList)

        // create div - sr only 
        let comboBoxStatus = document.createElement('div')
        Object.assign(comboBoxStatus, {
            id: 'comboBoxStatusId',
            name: 'comboBoxStatus',
            classList: 'usa-combo-box__status usa-sr-only',
            role: 'status',
        })

        basicOptionsComponent.append(comboBoxStatus)
        
        // create span - sr only msg 
        let comboBoxAssistiveHint = document.createElement('span')
        Object.assign(comboBoxAssistiveHint, {
            id: 'comboBoxAssistiveHintId',
            classList: 'usa-sr-only',
            innerHTML: 'When autocomplete results are available use up and down arrows to review and enter to select. Touch device users, explore by touch or with swipe gestures.',
        })

        basicOptionsComponent.append(comboBoxAssistiveHint)
        // <---------------end primary constraint section---------------> 

        // <---------------start secondary constraint section---------------> 
        let secondaryOptionText = document.createElement('p')
        let secondaryOptionValueList = basicOptionRecords.find(record => record.primaryconstraint === primaryConstraintDropdown.value)['secondaryconstraint'] 
        Object.assign(secondaryOptionText, {
            id: 'secondaryOptionTextId',
            style: 'display: none',
            innerText: secondaryOptionValueList === undefined ? undefined : secondaryOptionValueList[0]
        })

        //Create secondary constraint fields - Create label and dropdown
        let secondaryConstraintDropdown = document.createElement('select')
        Object.assign(secondaryConstraintDropdown, {
            id: 'secondaryConstraintDropdownId',
            classList: 'usa-select',
            style: 'display: none',
        })

        let secondaryConstraintLabel = document.createElement('label')
        Object.assign(secondaryConstraintLabel, {
            id: 'secondaryConstraintLabelId',
            classList: 'usa-label',
            style: 'display: none',
            innerHTML: `${attributeRecords.secondaryconstraintlabel}:&nbsp`,
        })

        basicOptionsDiv.append(secondaryConstraintLabel)
        basicOptionsDiv.append(secondaryOptionText)
        basicOptionsDiv.append(secondaryConstraintDropdown)

        //Add onchange for primary constraint dropdown to determine whether secondary constraint dropdown is displayed or not
        comboBoxInputField.onchange = function() {
            //selected = comboBoxInputField.value
            let secondaryOptions = basicOptionRecords.find(record => record.primaryconstraint === comboBoxInputField.value)
            secondaryOptions = secondaryOptions === undefined ? undefined : secondaryOptions["secondaryconstraint"]
            if (!secondaryOptions) {
                // show nothing and exit function 
                secondaryConstraintDropdown.style.display = 'none'
                secondaryOptionText.style.display = 'none'
                secondaryConstraintLabel.style.display = 'none'
                return
            }
            else if (secondaryOptions.length > 1) {
                //Has multiple secondary constraint options - display dropdwon

                //Append the secondary constraint options to dropdown list
                document.querySelectorAll('#secondaryConstraintDropdownId option').forEach(option => option.remove())
                for (let option in secondaryOptions) {
                    val = secondaryOptions[option]
                    option = document.createElement('option')
                    option.name = val
                    option.value = val
                    option.innerText = val
                    secondaryConstraintDropdown.append(option)
                }

                secondaryConstraintLabel.style.display = 'block'
                secondaryConstraintDropdown.style.display = 'block'
                secondaryConstraintLabel.setAttribute('for', 'secondaryConstraintDropdownId')
                secondaryOptionText.style.display = 'none'
            } else if (secondaryOptions.length == 1) { 
                //Has only one secondary constraint option - display that and hide dropdown
                secondaryConstraintLabel.style.display = 'block'
                secondaryConstraintDropdown.style.display = 'none'
                secondaryOptionText.innerHTML = secondaryOptions[0]
                secondaryOptionText.style.display = 'block'
            }
        }
        // <---------------end secondary constraint section--------------->
        $("#requiredOptionsBody").append(basicOptionsDiv)
    }

    //Group 2: Aggregatinon Method / Data Selection Options
    let lookupValue = []
    if (attributeRecords['complevelattribflag'] == false) {
        lookupValue = ['No Aggregation Necessary']
    } else if ((getAttributeValue(attributeRecords, 'algorithmname').toLowerCase()) == 'percent present') {
        lookupValue = ['Percent Present']
    } else if ((getAttributeValue(attributeRecords, 'algorithmname').toLowerCase() == 'weighted average') && (getAttributeValue(attributeRecords, 'attributetype').toLowerCase() == 'interpretation')) {
        lookupValue = ['Weighted Average']
    } else if ((getAttributeValue(attributeRecords, 'attributetype').toLowerCase() == 'interpretation') && (attributeRecords['ruledesign(2)'] == 1) || (attributeRecords['ruledesign(2)'] == 2)) {
        lookupValue = ['Dominant Condition', 'Dominant Component', 'Most Limiting', 'Least Limiting']
    } else if ((getAttributeValue(attributeRecords, 'attributelogicaldatatype').toLowerCase() == 'integer') || (getAttributeValue(attributeRecords, 'attributelogicaldatatype').toLowerCase() == 'float')) {
        lookupValue = ['Dominant Condition', 'Dominant Component', 'Weighted Average', 'Minimum or Maximum']
    } else if (getAttributeValue(attributeRecords, 'tiebreakdomainname').length > 0) {
        lookupValue = ['Dominant Condition', 'Dominant Component', 'Minimum or Maximum']
    } else {
        lookupValue = ['Dominant Condition', 'Dominant Component']
    }

    //Create a dropdown list, then append the aggregation methods to it
    let aggregationMethodDropdown = document.createElement('select')
    aggregationMethodDropdown.id = 'aggregationMethodDropdownId'
    aggregationMethodDropdown.setAttribute('class', 'usa-select')
    let dropdownLabel = document.createElement('label')
    dropdownLabel.setAttribute('for', 'aggregationMethodDropdownId')
    dropdownLabel.setAttribute('class', 'usa-label')
    dropdownLabel.innerHTML = 'Aggregation Method:&nbsp'
    let aggMethDesc = document.getElementById("aggMethDesc")
    aggMethDesc.innerHTML = response.descriptions.V0

    //Create descriptions for aggregation methods
    let name, value 
    for (let item in algorithmRecords) {
        if (lookupValue.includes(algorithmRecords[item].algorithmname)) {
            name = algorithmRecords[item].algorithmname
            value = algorithmRecords[item].algorithmdescription
        }
        else{
            continue
        }

        let aggregationDiv = document.createElement("div")
        let aggregationButton = document.createElement("button")
        let aggregationText = document.createElement("p")
        Object.assign(aggregationButton, {
            id: `${name}Button`,
            classList: "usa-accordion__heading usa-accordion__button",
            innerText: name
            
        })
        aggregationButton.setAttribute('aria-controls', `${name}Text`)
        aggregationButton.setAttribute('aria-expanded', false)

        Object.assign(aggregationText,{
            id: `${name}Text`,
            classList: "usa-accordion__content",
            innerHTML: value,
            hidden: true
        })
        aggMethDesc.appendChild(aggregationDiv)
        aggregationDiv.appendChild(aggregationButton)
        aggregationDiv.appendChild(aggregationText)
    }

    // If there's only one Aggregation Method available, then just display the text
    if (lookupValue.length == 1) {
        let aggMethodLabel = document.createElement('label')
        aggMethodLabel.innerHTML = "Aggregation Method:"
        aggMethodLabel.setAttribute("for", "aggregationMethodDropdownId")
        let aggMethodValue = Object.assign(document.createElement("p"), {
            "id" : "aggregationMethodDropdownId",
            "value": lookupValue[0]
            }
        )
        aggMethodValue.innerText = lookupValue[0]
        $("#sdvAdvancedOptionsBody").append(aggMethodLabel, aggMethodValue)
        $("#aggMethDescParent").show()
    } else {
        //Iterate through the algorithmRecords and generate dropdown options for every matching lookupValue
        let i = 0
        for (val in algorithmRecords) {
            if (lookupValue.includes(algorithmRecords[val].algorithmname)) {
                i++
                const option = document.createElement('option')
                option.name = algorithmRecords[val].algorithmname
                option.value = algorithmRecords[val].algorithmname
                option.innerText = algorithmRecords[val].algorithmname
                option.setAttribute('DescriptionId', 'A' + algorithmRecords[val].algorithmsequence.toString())
                aggregationMethodDropdown.append(option)
                //Set the selected aggregation method to the recommended default setting
                if(algorithmRecords[val].algorithmname == response.sdvAttributeRecords[0].algorithmname){
                    aggregationMethodDropdown.selectedIndex = i - 1
                }
            }
        }

        //Append the label and Aggregation Method Dropdown to a div, then append the div to the ratingOptionsContainer
        let div = document.createElement('div')
        div.append(dropdownLabel)
        div.append(aggregationMethodDropdown)
        $("#sdvAdvancedOptionsBody").append(div)
        $("#aggMethDescParent").show()
    }
    //Group 3: Component Percent Cutoff
    if (attributeRecords['complevelattribflag'] == true) {
        let compPercentCutoffDiv = document.createElement('div')
        let compPercentCutoffValue = attributeRecords['componentpercentcutoff']
        let compPercentCutoffControl = document.createElement('input')
        Object.assign(compPercentCutoffControl, {
            id: 'compPercentCutoffId',
            name: 'compPercentCutoff',
            type: 'number', 
            value: compPercentCutoffValue,
            tabindex: '0',
            classList: 'usa-input',
        })
        let compPercentCutoffLabel = document.createElement('label')
        Object.assign(compPercentCutoffLabel, {
            classList: 'usa-label',
            innerHTML: 'Component % Cutoff:&nbsp',
        })
        compPercentCutoffLabel.setAttribute('for', compPercentCutoffControl.id)
        compPercentCutoffDiv.append(compPercentCutoffLabel, compPercentCutoffControl)
        //Create and add validation text
        let validationText = document.createElement('p')
        Object.assign(validationText, {
            id: 'validationTextId',
            style: 'display: none',
            classList: 'validationText',
        })
        compPercentCutoffDiv.appendChild(validationText)
        populateRatingDescriptions($("#compPerCutoffDescText"), response.descriptions.V1)
        $("#compPerCutoffDesc").show()
        $("#sdvAdvancedOptionsBody").append(compPercentCutoffDiv)
    }
    else{
        $("#compPerCutoffDesc").hide()
    }

    //Group 4: Tie-break Rule
    let tieBreakFieldset = Object.assign(document.createElement('fieldset'), {className:'usa-fieldset'})
    let tieBreakLabel = Object.assign(document.createElement('legend'), {className:'usa-legend', innerHTML:'Tie Break Rule: '})

    tieBreakFieldset.append(tieBreakLabel)
    let tieBreakOptions = {}
    let lowLabel = getAttributeValue(attributeRecords, 'tiebreaklowlabel').length == 0 ? "Lower" : getAttributeValue(attributeRecords, "tiebreaklowlabel")
    let highLabel = getAttributeValue(attributeRecords, 'tiebreakhighlabel').length == 0 ? "Higher" : getAttributeValue(attributeRecords, "tiebreakhighlabel")
    tieBreakOptions[lowLabel] = false
    tieBreakOptions[highLabel] = true

    //Iterate through the two options and generate radio button controls
    for (const option in tieBreakOptions) {
        let tieBreakDiv = Object.assign(document.createElement('div'), {className:'usa-radio'})

        let input = Object.assign(document.createElement('input'), {
            className:'sdvRadioButtonControls', 
            type:'radio', 
            tieBreakValue:tieBreakOptions[option],
            name:'tieBreakRuleControl', 
            id:`tieBreak${tieBreakOptions[option] === false ? 'Lower' : 'Higher'}`
        })
        input.setAttribute('DescriptionID', 'V2')
        input.setAttribute('class', 'usa-radio__input')

        let label = Object.assign(document.createElement('label'), {
            innerText:option, 
            classList:'sdvRadioButtonControls usa-radio__label'
        })
        label.setAttribute('for', `tieBreak${tieBreakOptions[option] === false ? 'Lower' : 'Higher'}`)

        //Set the Default checked value based on the value in the 'tiebreakrule' column
        if (attributeRecords['tiebreakrule'] == input.tieBreakValue) input.checked = true

        //Always show the controls, but disable them when optionflag == false
        if (attributeRecords['tiebreakruleoptionflag'] == false) input.disabled = true

        tieBreakDiv.appendChild(input)
        tieBreakDiv.append(label)
        tieBreakFieldset.append(tieBreakDiv)
    }
    populateRatingDescriptions($("#tieBreakRuleDescText"), response.descriptions.V2)
    $("#tieBreakRuleDesc").show()
    $("#sdvAdvancedOptionsBody").append(tieBreakFieldset)

    //Group 5: Interpret Nulls as Zero
    //Only generate/ display the Interpret Nulls as Zero control when the if statement conditions are met
    if (attributeRecords['complevelattribflag'] == true && getAttributeValue(attributeRecords, 'attributetype').toLowerCase() == 'property'
        && (getAttributeValue(attributeRecords, 'attributelogicaldatatype').toLowerCase() == 'integer' || getAttributeValue(attributeRecords, 'attributelogicaldatatype').toLowerCase() == 'float')) {
        let interpretNullFieldset = Object.assign(document.createElement('fieldset'), {className:'usa-fieldset'})

        let interpretNullLegend = Object.assign(document.createElement('legend'), {className:'usa-legend', innerHTML:'Interpret Nulls as Zero:'})
        interpretNullFieldset.append(interpretNullLegend)

        let interpretNullOptions = {}
        interpretNullOptions['Yes'] = true
        interpretNullOptions['No'] = false

        //Iterate through the two options and generate radio button controls
        for (let option in interpretNullOptions) {
            let interpretNullsDiv = Object.assign(document.createElement('div'), {className:'usa-radio'})

            let interpretNullInput = Object.assign(document.createElement('input'), {
                type:'radio', 
                className:'usa-radio__input', 
                interpNullValue:interpretNullOptions[option], 
                name:'Interpret Nulls as Zero', 
                id:`interpNullAsZero${interpretNullOptions[option]}`
            })
            interpretNullInput.setAttribute('DescriptionID', 'V3')

            let interpretNullLabel = Object.assign(document.createElement('label'), {
                innerText:option, 
                classList:'sdvRadioButtonControls usa-radio__label'
            })
            interpretNullLabel.setAttribute('for', `interpNullAsZero${interpretNullOptions[option]}`)

            //Set the Default checked value based on the value in the 'interpnullsaszeroflag' column & the current option being iterated on
            if (attributeRecords['interpnullsaszeroflag'] == true && interpretNullOptions[option] == true) interpretNullInput.checked = true
            if (attributeRecords['interpnullsaszeroflag'] == false && interpretNullOptions[option] == false) interpretNullInput.checked = true

            //Always show the controls, but disable them when interpnullsaszerooptionflag == false
            if (attributeRecords['interpnullsaszerooptionflag'] == false) interpretNullInput.disabled = true

            interpretNullsDiv.appendChild(interpretNullInput)
            interpretNullsDiv.append(interpretNullLabel)
            interpretNullFieldset.append(interpretNullsDiv)
        }

        $("#sdvAdvancedOptionsBody").append(interpretNullFieldset)
        populateRatingDescriptions($("#interpNullAsZeroDescText"), response.descriptions.V3)
        $("#interpNullAsZeroDesc").show()
    }
    else{
        $("#interpNullAsZeroDesc").hide()
    }

    //Group 6: Layer Options
    if (attributeRecords['horzlevelattribflag'] == true) {
        //Define variables
        let horzaggMeth = getAttributeValue(attributeRecords, 'horzaggmeth');
		let layerOptionMode = getAttributeValue(attributeRecords, 'depthqualifiermode');
        let layerOptionsModeFlag = attributeRecords['dqmodeoptionflag'];
		let depthUnits = getAttributeValue(attributeRecords, 'layerdepthuom');

        //Create div & label for the entire Layer Options Control
        let layerOptionsFieldSet = Object.assign(document.createElement('fieldset'), {className:'usa-fieldset', id:'layerOptionsDiv'})
        let layerOptionsLegend = Object.assign(document.createElement('legend'), {className:'usa-legend', innerHTML:'Layer Options (Horizon Aggregation Method): '})
        layerOptionsLegend.setAttribute('DescriptionID', 'V4')
        layerOptionsFieldSet.appendChild(layerOptionsLegend)

        //Generate first radio button control for Surface Layer
        let surfaceLayerDiv = Object.assign(document.createElement('div'), {className:'usa-radio'})
        let surfaceLayerLabel = Object.assign(document.createElement('label'), {innerText: 'Surface Layer (Not applicable)', classList:'sdvRadioButtonControls usa-radio__label' })
        surfaceLayerLabel.setAttribute('for', 'surfaceLayerInputId')
        let surfaceLayerInput = Object.assign(document.createElement('input'), {id: 'surfaceLayerInputId', classList: 'sdvRadioButtonControls usa-radio__input layerOptions', type: 'radio', 
            name: 'layerOptionControl', value: 'Surface Layer'})
        surfaceLayerInput.setAttribute('tabindex', '0')
        if (layerOptionMode == 'Surface Layer') surfaceLayerInput.checked = true
        surfaceLayerDiv.appendChild(surfaceLayerInput)
        surfaceLayerDiv.appendChild(surfaceLayerLabel)
        layerOptionsFieldSet.append(surfaceLayerDiv)

        //Generate second radio button control for Depth Range
        let depthLayerDiv = Object.assign(document.createElement('div'), {className:'usa-radio'})
        let depthRangeLabel = Object.assign(document.createElement('label'), {innerText: `Depth Range (${horzaggMeth})`, classList:'sdvRadioButtonControls usa-radio__label'})
        depthRangeLabel.setAttribute('for', 'depthRangeInputId')
        let depthRangeInput = Object.assign(document.createElement('input'), {id: 'depthRangeInputId', classList: 'sdvRadioButtonControls usa-radio__input layerOptions', 
            type: 'radio', name: 'layerOptionControl', value: 'Depth Range'})
        depthRangeInput.setAttribute('tabindex', '0')
        if (layerOptionMode == 'Depth Range') depthRangeInput.checked = true
        depthLayerDiv.appendChild(depthRangeInput)
        depthLayerDiv.appendChild(depthRangeLabel)
        layerOptionsFieldSet.append(depthLayerDiv)

        //Generate secondary div under Depth Range containing depth inputs and unit of measure radio buttons

        let innerDepthFieldset = Object.assign(document.createElement('fieldset'), {className: 'usa-fieldset', id:'innerDepthFieldset'})
        let innerDepthLegend = Object.assign(document.createElement('legend'), {style: 'display:none;', innerText:'Depth Range (Weighted Average)'})
        innerDepthFieldset.appendChild(innerDepthLegend)

        //Define input/ label for top depth
        let topDepthDiv = document.createElement('div')
        let topDepthLabel = Object.assign(document.createElement('label'), {innerText:'Top Depth', classList: 'usa-label depthRangeLabels'})
        topDepthLabel.setAttribute('for', 'topDepthInputId')
        let topDepthInput = Object.assign(document.createElement('input'), {id: 'topDepthInputId', type:'number', classList: 'usa-input depthRangeInputs'})
        topDepthInput.setAttribute('tabindex', '0')
        if (depthRangeInput.checked == true) {
            topDepthInput.disabled = false
        } else {
            topDepthInput.disabled = true
        }
        topDepthDiv.append(topDepthLabel, topDepthInput)
        //Create and add validation text for top depth input field 
        let validationTextTopDepth = document.createElement('p')
        Object.assign(validationTextTopDepth, {
            id: 'validationTextTopDepthId', 
            classList: 'validationText',
            style: 'display:none'
        })
        topDepthDiv.appendChild(validationTextTopDepth)
        //Define input/ label for bottom depth
        let bottomDepthDiv = document.createElement('div')
        let bottomDepthLabel = Object.assign(document.createElement('label'), {innerText:'Bottom Depth', className: 'usa-label depthRangeLabels'})
        bottomDepthLabel.setAttribute('for', 'bottomDepthInputId')
        let bottomDepthInput = Object.assign(document.createElement('input'), {id: 'bottomDepthInputId', type:'number', className: 'usa-input depthRangeInputs'})
        bottomDepthInput.setAttribute('tabindex', '0')
        if (depthRangeInput.checked == true) {
            bottomDepthInput.disabled = false
        } else {
            bottomDepthInput.disabled = true
        }
        bottomDepthDiv.append(bottomDepthLabel, bottomDepthInput)
        //Create and add validation text for bottom depth input field 
        let validationTextBottomDepth = document.createElement('p')
        Object.assign(validationTextBottomDepth, {
            id: 'validationTextBottomDepthId', 
            classList: 'validationText',
            style: 'display:none'
        })
        bottomDepthDiv.appendChild(validationTextBottomDepth)
        //Define input/ label for inches
        let inchesDiv = Object.assign(document.createElement('div'), {className: 'usa-radio'})
        let inchesLabel = Object.assign(document.createElement('label'), {innerText:'Inches', id:'inchesLabel', className:'usa-radio__label'})
        inchesLabel.setAttribute('for', 'inchesInputId')
        let inchesInput = Object.assign(document.createElement('input'), {id: 'inchesInputId', type:'radio', name:'depthRangeUnit', 
            classList: 'depthRangeInputs usa-radio__input', value: 'in'})
        //inchesInput.setAttribute('aria-labelledby', 'inchesLabel')
        inchesInput.setAttribute('tabindex', '0')
        if (depthRangeInput.checked == true) {
            inchesInput.disabled = false
        } else {
            inchesInput.disabled = true
        }
        if (depthUnits == 'Inches') inchesInput.checked = true
        inchesDiv.append(inchesInput, inchesLabel)
        //Define input/ label for centimeters
        let centimetersDiv = Object.assign(document.createElement('div'), {className:'usa-radio'})
        let centimetersLabel = Object.assign(document.createElement('label'), {innerText:'Centimeters', id:'centimetersLabel', className:'usa-radio__label'})
        centimetersLabel.setAttribute('for', 'centimetersInputId')
        let centimetersInput = Object.assign(document.createElement('input'), {id: 'centimetersInputId', type:'radio', name:'depthRangeUnit', 
            classList: 'depthRangeInputs usa-radio__input', value: 'cm'})
        //centimetersInput.setAttribute('aria-labelledby', 'centimetersLabel')
        centimetersInput.setAttribute('tabindex', '0')
        if (depthRangeInput.checked == true) {
            centimetersInput.disabled = false
        } else {
            centimetersInput.disabled = true
        }
        if (depthUnits == 'Centimeters') centimetersInput.checked = true
        centimetersDiv.append(centimetersInput, centimetersLabel)
        //Append everything to the depthRangeDiv, then to the root layerOptionsDiv
        innerDepthFieldset.append(topDepthDiv, bottomDepthDiv, inchesDiv, centimetersDiv)
        layerOptionsFieldSet.append(innerDepthFieldset)

        //Generate third radio button control for All Layers
        let allLayersDiv = Object.assign(document.createElement('div'), {className:'usa-radio'})
        let allLayersLabel = Object.assign(document.createElement('label'), {innerText: `All Layers (${horzaggMeth})`, classList:'sdvRadioButtonControls usa-radio__label'})
        allLayersLabel.setAttribute('for', 'allLayersInputId')
        let allLayersInput = Object.assign(document.createElement('input'), {id: 'allLayersInputId', classList: 'sdvRadioButtonControls usa-radio__input layerOptions', type: 'radio', 
            name: 'layerOptionControl', value: 'All Layers'})
        allLayersInput.setAttribute('tabindex', '0')
        if (layerOptionMode == 'All Layers') allLayersInput.checked = true
        allLayersDiv.appendChild(allLayersInput)
        allLayersDiv.appendChild(allLayersLabel)
        layerOptionsFieldSet.append(allLayersDiv)

        //Disable all Input controls if LayerOptionModeFlag == 0
        if (layerOptionsModeFlag == false) {
            let inputs = layerOptionsFieldSet.getElementsByTagName('input');
            for (let i = 0; i < inputs.length; i++) {
                inputs[i].disabled = true;
            }
        }

        if (layerOptionMode == 'Depth Range'){
            $("#requiredOptionsBody").append(layerOptionsFieldSet)
        }
        else{
            $("#sdvAdvancedOptionsBody").append(layerOptionsFieldSet)
        }
        populateRatingDescriptions($("#layerOptionsDescText"), response.descriptions.V4)
        $("#layerOptionsDesc").show()
    }
    else{
        $("#layerOptionsDesc").hide()
    }

    //Group 7: Month Range
    if (attributeRecords['cmonthlevelattribflag'] == true) {
        //Define variables
        let beginningMonth = getAttributeValue(attributeRecords, 'beginningmonth');
		let endingMonth = getAttributeValue(attributeRecords, 'endingmonth');
        let months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

        //Create outer div, beginning/ ending Month Labels and Dropdowns for the Month Range Control
        let monthRangeDiv = Object.assign(document.createElement('div'), {id: 'monthRangeDiv'})
        monthRangeDiv.setAttribute('DescriptionID', 'V5')
        let beginningMonthLabel = Object.assign(document.createElement('label'), {className: 'usa-label', innerText: 'Beginning Month:', htmlFor: 'beginningMonthDropdown'})
        let beginningMonthDropdown = Object.assign(document.createElement('select'), {className: 'usa-select', id: 'beginningMonthDropdown', name: 'beginningMonthOptions'})
        let endingMonthLabel = Object.assign(document.createElement('label'), {className: 'usa-label',innerText: 'Ending Month:', htmlFor: 'endingMonthDropdown'})
        let endingMonthDropdown = Object.assign(document.createElement('select'), {className: 'usa-select',id: 'endingMonthDropdown', name: 'endingMonthOptions'})

        //Generate control for Beginning & Ending Month & append month options
        for (const month in months) {
            let beginningMonthOption = Object.assign(document.createElement('option'), {id: `beginningMonthOption${months[month]}`, type: 'option', 
                name: 'monthRangeControl', value: `${months[month]}`, innerText: `${months[month]}`})
            let endingMonthOption = Object.assign(document.createElement('option'), {id: `endingMonthOption${months[month]}`, type: 'option', 
                name: 'monthRangeControl', value: `${months[month]}`, innerText: `${months[month]}`})

            //set default values for both beginning and ending month
            if (months[month] == beginningMonth) beginningMonthOption.setAttribute('selected', 'selected')
            if (months[month] == endingMonth) endingMonthOption.setAttribute('selected', 'selected')
            
            //append option to dropdown
            beginningMonthDropdown.append(beginningMonthOption)
            endingMonthDropdown.append(endingMonthOption)
        }

        //Append labels and dropdowns to the MonthRangeDiv, then append it to the root ratingOptionsContainer
        monthRangeDiv.append(beginningMonthLabel, beginningMonthDropdown, endingMonthLabel, endingMonthDropdown)
        $("#sdvAdvancedOptionsBody").append(monthRangeDiv)

        // Disable both beginning and ending month dropdowns when the monthrangeoptionflag is false
        if (attributeRecords['monthrangeoptionflag'] == false){
            beginningMonthDropdown.disabled = true
            endingMonthDropdown.disabled = true
        }
        populateRatingDescriptions($("#monthRagneDescText"), response.descriptions.V5)
        $("#monthRangeDesc").show()        
    }
    else{
        $("#monthRangeDesc").hide()
    }
    //If the ratingOptionsContainer does not already have a listener, create one. This prevents multiple instances of the same listener from being created
    if(ratingOptionsContainer.getAttribute('hasListener') !== "true"){
        ratingOptionsContainer.setAttribute('hasListener', true)
        ratingOptionsContainer.addEventListener('change', async function(e){
            checkValidations(e)
        })
    }
    if($("#requiredOptionsBody").is(":empty")){
        $("#requiredOptionsBody").html('<label for="sdvRequiredOptionsContainer">There are no required options for this rating</label>')
    }
    $("#sdvRequiredOptionsContainer, #sdvAdvancedOptionsContainer").show()
}

/**This function takes in a list and a key, then returns the key's value.*/
function getAttributeValue(list, key) {
    if (typeof(key) == 'string') {
        if(list[key] != null) {
            return list[key].toString().trim();
        }
        else {
            return ''
        }
    } 
    else {
        throw new TypeError('Incorrect datatype passed in.')
    }
}

/**This function performs a series of checks to determine if the View Data button should be enabled or disabled */
function checkEnableViewData(){
    /*
        If sdvRatingOptions div is not displayed OR
        If sdvRatingOptions div is empty OR
        If validation text is displayed OR
        If Depth Range is selected AND
            No values are provided for top OR bottom OR
            A unit of measure is not selected OR
        If a primary basic option is available AND not selected
        If a secondary basic option is available AND not selected:

        Disable the View Data button.
    */

    (
        ($("#sdvRatingOptions").is(":visible") === false ||
        $("#sdvRatingOptions").is(":empty") ||
        $(".validationText").is(":visible") === true || 
        ($("input:radio.layerOptions:checked").val() === "Depth Range" &&
            (($("#topDepthInputId").val() === '' || $("#bottomDepthInputId").val() === '') || 
            (!$("#inchesInputId").is(":checked") && !$("#centimetersInputId").is(":checked")))
        ) ||
        ($("#comboBoxInputFieldId").is(":visible") && $("#comboBoxInputFieldId").val() === "") ||
        (($("secondaryConstraintDropdownId").is(":visible") && $("#secondaryConstraintDropdownId").val() === "") && 
            ($("#secondaryOptionTextId").is(":visible") && $("#secondaryOptionTextId").val() === "")
        )) 
        ? viewDataBtn.disabled = true : viewDataBtn.disabled = false
    )
}

/**Save a bit of time by checking to see if the rating option description has been written to yet. If it has, do nothing.
 * ratingObj MUST BE A Jquery object.
 */
function populateRatingDescriptions(ratingObj, ratingDesc){
    if(ratingObj.html() == ""){
        ratingObj.html(ratingDesc)
    }
}

/**Validation checks for SDV rating options*/ 
function checkValidations(e) { 
    //Group 6: Layer Options Validations 
    //Get invalid message divs
    const invalidTextTopDepthDiv = document.getElementById('validationTextTopDepthId')
    const invalidTextBottomDepthDiv = document.getElementById('validationTextBottomDepthId')

    //Get layer options input field components 
    const depthRangeInput = document.getElementById('depthRangeInputId')
    
    const topDepthInput = document.getElementById('topDepthInputId')
    const bottomDepthInput = document.getElementById('bottomDepthInputId')
    const inchesInput = document.getElementById('inchesInputId')
    const centimetersInput = document.getElementById('centimetersInputId')
    //Enable depth range input fields if "Depth Range" is selected. Disable if "Surface Layer" or "All Layers" is selected.
    if (e.target.id == 'surfaceLayerInputId' || e.target.id == 'depthRangeInputId' || e.target.id == 'allLayersInputId') {
        if (depthRangeInput.checked == true) {
            topDepthInput.disabled = false
            bottomDepthInput.disabled = false
            inchesInput.disabled = false
            centimetersInput.disabled = false
        } else {
            //surfaceLayerInput or allLayersInput is selected 
            topDepthInput.value = ''
            bottomDepthInput.value = ''
            topDepthInput.disabled = true
            bottomDepthInput.disabled = true
            inchesInput.disabled = true 
            centimetersInput.disabled = true 
            invalidTextTopDepthDiv.style.display = 'none'
            if (topDepthInput.classList.contains('invalidIcon')) {
                topDepthInput.classList.remove('invalidIcon')
            }
            invalidTextBottomDepthDiv.style.display = 'none'
            if (bottomDepthInput.classList.contains('invalidIcon')) {
                bottomDepthInput.classList.remove('invalidIcon')
            }
        }
    }

    //Depth range inputs - top & bottom depth input fields validations (Group 6) 
    if (e.target.id == 'topDepthInputId' || e.target.id == 'bottomDepthInputId') {
        //If there's no input value, show error and exit function 
        if (! e.target.value) {
            if (e.target.id == 'topDepthInputId') {
                e.target.classList.add('invalidIcon')
                invalidTextTopDepthDiv.innerHTML = "Integer required between 0 and 9999, inclusive"
                invalidTextTopDepthDiv.style.display = 'block'
                return;
            } else if (e.target.id == 'bottomDepthInputId') {
                e.target.classList.add('invalidIcon')
                invalidTextBottomDepthDiv.innerHTML = "Integer required between 0 and 9999, inclusive"
                invalidTextBottomDepthDiv.style.display = 'block'
                return;
            }
        }

        var topDepthInputStr, topDepthInputNum, bottomDepthInputStr, bottomDepthInputNum; 
    
        var isTopDepthInt = true
        var isTopDepthWithinRange = true
        var isBottomDepthInt = true
        var isBottomDepthWithinRange = true
        var isTopLessThanBottom = true
    
        //Set input field values (coming in as type str)
        topDepthInputStr = topDepthInput.value 
        bottomDepthInputStr = bottomDepthInput.value

        //Parse input value strings and return as integers 
        topDepthInputNum = parseInt(topDepthInputStr)
        bottomDepthInputNum = parseInt(bottomDepthInputStr)
    
        //Check for integer inputs only (decimals or anything else will throw an error)
        isTopDepthInt = (/^[0-9]+$/.test(topDepthInputStr)) ? true : false
        isBottomDepthInt = (/^[0-9]+$/.test(bottomDepthInputStr)) ? true : false
        
        //Check that inputs are within 0 and 9999, inclusive 
        isTopDepthWithinRange = (topDepthInputNum >= 0 && topDepthInputNum <= 9999) ? true : false
        isBottomDepthWithinRange = (bottomDepthInputNum >= 0 && bottomDepthInputNum <= 9999) ? true : false
    
        //Check if top depth input is < bottom depth input
        if (topDepthInputStr && bottomDepthInputStr && (topDepthInputNum >= bottomDepthInputNum)) {
            isTopLessThanBottom = false
        } else {
            isTopLessThanBottom = true
        }

        //Check top depth. Display or remove invalid message and styling accordingly  
        if (isTopDepthInt && isTopDepthWithinRange && isTopLessThanBottom) {
            //Top depth - all valid 
            invalidTextTopDepthDiv.style.display = 'none'
            if (topDepthInput.classList.contains('invalidIcon')) {
                topDepthInput.classList.remove('invalidIcon')
            }
        } else if (!isTopDepthInt || !isTopDepthWithinRange) { 
            //Top depth is not an int or is out of num range 
            if (e.target.id == 'topDepthInputId') {
                topDepthInput.classList.add('invalidIcon')
                invalidTextTopDepthDiv.innerHTML = "Integer required between 0 and 9999, inclusive"
                invalidTextTopDepthDiv.style.display = 'block'
            }
        } else if (!isTopLessThanBottom) {
            //Top depth value is > bottom depth value 
            topDepthInput.classList.add('invalidIcon')
            invalidTextTopDepthDiv.innerHTML = "Top depth value must be less than bottom depth value"
            invalidTextTopDepthDiv.style.display = 'block'
            bottomDepthInput.classList.add('invalidIcon')
            invalidTextBottomDepthDiv.innerHTML = "Top depth value must be less than bottom depth value"
            invalidTextBottomDepthDiv.style.display = 'block'
        }
    
        //Check bottom depth. Display or remove invalid message and styling accordingly  
        if (isBottomDepthInt && isBottomDepthWithinRange && isTopLessThanBottom ) {
            //Bottom depth - all valid 
            invalidTextBottomDepthDiv.style.display = 'none'
            if (bottomDepthInput.classList.contains('invalidIcon')) {
                bottomDepthInput.classList.remove('invalidIcon')
            }
        } else if (!isBottomDepthInt || !isBottomDepthWithinRange) { 
            //Bottom depth is not an int or is out of num range 
            if (e.target.id == 'bottomDepthInputId') {
                bottomDepthInput.classList.add('invalidIcon')
                invalidTextBottomDepthDiv.innerHTML = "Integer required between 0 and 9999, inclusive"
                invalidTextBottomDepthDiv.style.display = 'block'
            }
        } else if (!isTopLessThanBottom) {
            //Top depth value is > bottom depth value 
            bottomDepthInput.classList.add('invalidIcon')
            invalidTextTopDepthDiv.innerHTML = "Top depth value must be less than bottom depth value"
            invalidTextTopDepthDiv.style.display = 'block'
            bottomDepthInput.classList.add('invalidIcon')
            invalidTextBottomDepthDiv.innerHTML = "Top depth value must be less than bottom depth value"
            invalidTextBottomDepthDiv.style.display = 'block'
        }
    }


    //Group 3: Component Percent Cutoff Validations 
    if (e.target.id == 'compPercentCutoffId') {
        const inputVal = e.target.value
        const invalidTextDiv = document.getElementById('validationTextId')
        //e.target is not a required field, input box can be left empty/blank
        if (!inputVal) {    //Exit function
            invalidTextDiv.style.display = 'none'
            if (e.target.classList.contains('invalidIcon')) {
                e.target.classList.remove('invalidIcon')
            }
            checkEnableViewData()
            return;
        }
        //Check if input is integer only between 0 and 100, inclusive 
        if (!(/^[0-9]+$/.test(inputVal)) || inputVal < 0 || inputVal > 100) {
            e.target.classList.add('invalidIcon')
            invalidTextDiv.innerHTML = 'Value must be an integer between 0 and 100, inclusive'
            invalidTextDiv.style.display = 'block'
        //All validation checks pass!
        } else { 
            invalidTextDiv.style.display = 'none'
            if (e.target.classList.contains('invalidIcon')) {
                e.target.classList.remove('invalidIcon')
            }
        }
    }
    checkEnableViewData()
}
var sdvLoadingScreen
//var ratingDbTableName

function buildRatingTable(tableObj){
    for(const soil in tableObj.data){
        const row = document.createElement('tr')
        for(const cell in tableObj.data[soil]){
            const td = document.createElement('td')
            td.innerText = tableObj.data[soil][cell]
            row.appendChild(td)
        }
        tableObj.tbody.appendChild(row)
    }
}

async function generateAggregation(){
    let aggregationParameters = new sdvAggregationParams()
    document.getElementById('ratingTableContainer').innerHTML = ""
    sdvLoadingScreen = new sdvLoadingDisplay(document.getElementById("homePageContainer") ,document.getElementById("sdvLoadingScreen"), 
                document.getElementById("sdvRatingResultsPage"), document.getElementById("sdvRatingHeading"), document.getElementById("sdvLoadingBar"), 
                document.getElementById("sdvTimerCount"), document.getElementById("sdvLoadingButton"), document.getElementById('viewRatingResults'), 
                document.getElementById("sdvLoadingMessage"))
    sdvLoadingScreen.startLoadingScreen("Generating rating", "Cancel")
    let genAggrRequest = {'request': generateAggregationRequest, 'database': databasePath, 'aggregationparameters': aggregationParameters, 'aggregationrules': aggregationRuleResponse}
    let response = await sendData(genAggrRequest)
    if(response && response.status && showSdvResultsFlag){
        let ratingTable = new Table("ratingTable", ratingTableHeaders, response.frame, "ratingTableContainer")
        ratingTable.buildTable()    
        ratingTable.buildTableHeader()
        ratingTable.table.appendChild(ratingTable.tbody)
        ratingTable.tbody.setAttribute("id", "ratingTbody")
        buildRatingTable(ratingTable)
        $("#sdvRatingResultsName").text(aggregationParameters["attributename"])
    }
    if(!response || !response.status){
        //If the response does not come back or the rating fails.
        sdvLoadingScreen.finishLoading("Rating failed to generate", "Close", "Failed", "bg-danger", response?.errormessage ? response.errormessage : "An unknown error occured while trying to generate the rating")
    }
    else{
        sdvLoadingScreen.finishLoading("Rating successfully generated", "Close", "Success", "bg-success", response.message)
    }
}

//This is a function that will need to be further worked on at a later point in time.
function sortRating(tableName, column){
    let response = fetch(url, {
        method: 'POST',
        headers: {'Content-Type' : 'application/json'},
        body: JSON.stringify({
            'request': 'sortratingtable'
            ,'database': databasePath
            ,'table': tableName
            ,'column': column
        })
    }).catch((error) => {
        console.error("Error:", error)
        echo("Unable to connect to server.")
    })    
    ratingTable.tbody.innerHTML = ""
    ratingTable.data = response.frame
    buildRatingTable()
}

/********************************************End SDV Logic*********************************************/

function finishLoading(){    
    $("#landingPageContainer").attr("aria-hidden", false)
    $("#startupLoadingMsg").text("Finished startup processes.")
    $("#closeStartupLoadingScreen, #startupDoneLoadingImg, #startupLoadingSpinner").toggle()
    $("#closeStartupLoadingScreen").focus()}
    $("#startupLoadingScreen>.subpage-display--body").attr("aria-busy", false)

//Documentation at Mozilla states that the unload event suite should not be used and is not reliably executed.
        // The pagehide has not been thoroughly tested on my end however
        //The sendBeacon seems to work even after being idle for extended periods of time.
window.addEventListener('pagehide', function(){
    navigator.sendBeacon('/close')
})

//Send any unhandled errors to the log file. NOTE: STACK IS NONSTANDARD and should only be used as a last resort.
//Potential errors should be placed inside of a try/catch block in order to avoid this catch all.
window.addEventListener('error', e => {
        logJavaScriptError(e.error.stack)
})

//Log errors that occured in a promise statement
window.addEventListener('unhandledrejection', e =>{
    logJavaScriptError(e.reason.stack)
})

//Present a warning to users when trying to navigate away.
window.onbeforeunload = function(){
    return "Are you sure you want to leave this page?"
}

async function getLocalVersionInfo() {
    const getCookieValue = (name) => {
        if (BrowserStorage && typeof BrowserStorage.getCookie === 'function') {
            return BrowserStorage.getCookie(name)
        }

        const cookiePrefix = `${name}=`
        const cookieItem = document.cookie
            .split(';')
            .map((part) => part.trim())
            .find((part) => part.startsWith(cookiePrefix))

        return cookieItem ? decodeURIComponent(cookieItem.slice(cookiePrefix.length)) : ''
    }

    const versionInfo = {
        ApplicationVersion: getCookieValue("ApplicationVersion"),
        SQLiteSSURGOTemplateVersion: getCookieValue("SQLiteSSURGOTemplateVersion"),
        SSURGOVersion: getCookieValue("SSURGOVersion")
    }

    try {
        const localVersionResponse = await fetch('/getVersionInfoLocal', { cache: 'no-store' })
        if (localVersionResponse.ok) {
            const localVersionInfo = await localVersionResponse.json()
            if (localVersionInfo && typeof localVersionInfo === 'object') {
                versionInfo.ApplicationVersion = localVersionInfo.ApplicationVersion ?? versionInfo.ApplicationVersion
                versionInfo.SQLiteSSURGOTemplateVersion = localVersionInfo.SQLiteSSURGOTemplateVersion ?? versionInfo.SQLiteSSURGOTemplateVersion
                versionInfo.SSURGOVersion = localVersionInfo.SSURGOVersion ?? versionInfo.SSURGOVersion
            }
        }
    } catch (err) {
        fetch('/tlogger/warning:Unable%20to%20fetch%20local%20version%20info')
    }

    return versionInfo
}

function compareDottedVersions(currentVersion, latestVersion) {
    const parseParts = (versionText) => String(versionText)
        .trim()
        .split('.')
        .map(part => {
            const parsed = Number.parseInt(part, 10)
            return Number.isNaN(parsed) ? 0 : parsed
        })

    const currentParts = parseParts(currentVersion)
    const latestParts = parseParts(latestVersion)
    const maxLen = Math.max(currentParts.length, latestParts.length)

    for (let i = 0; i < maxLen; i++) {
        const currentPart = currentParts[i] ?? 0
        const latestPart = latestParts[i] ?? 0
        if (currentPart < latestPart) return -1
        if (currentPart > latestPart) return 1
    }

    return 0
}

async function checkForPortalUpdate(curVersion) {
    let versionToCheck = curVersion
    if (versionToCheck === '0.0.0.0') {
        fetch('/tlogger/debug:Test%20Version%20Detected')
        return
    }
    if (!versionToCheck || versionToCheck === 'unknown') {
        fetch('/tlogger/warning:Version%20is%20Not%20Set')
        return
    }
    if (navigator.onLine === false) {
        fetch('/tlogger/warning:No%20Internet%20Connection')
        return
    }

    let newestVersion = ''
    try {
        const newestVersionResponse = await fetch('/getVersion')
        newestVersion = (await newestVersionResponse.text()).trim()
    } catch (error) {
        fetch('/tlogger/warning:Unable%20to%20check%20for%20updates')
        return
    }

    if (!newestVersion || newestVersion.startsWith('Error')) {
        let errorMsg = 'warning:' + newestVersion.replaceAll(' ','%20')
        fetch('/tlogger/' + errorMsg)
        return
    }

    const versionCompare = compareDottedVersions(versionToCheck, newestVersion)
    if (versionCompare >= 0) {
        fetch('/tlogger/info:SSURGO%20Portal%20is%20up%20to%20date')
        return
    }

    let modalBody = document.getElementById("versionCheckModalMessage")
    modalBody.innerText = "SSURGO Portal " + newestVersion + " is available. (You have " + versionToCheck + ".)"
    let downloadButton = document.getElementById("downloadButton")
    downloadButton.innerText = "Download v" + newestVersion
    document.getElementById('versionCheckModalBtn').click()
}

//When the webpage first loads, check to see if the server is running. Then issue a request to populate the tree view under the create database tab
window.onload = async function(){
    const initialVersionInfo = await getLocalVersionInfo()
    window.portalVersionInfo = initialVersionInfo
    const initialVersion = initialVersionInfo.ApplicationVersion || 'unknown'
    Array.from(document.getElementsByClassName("versionNumText")).forEach((el) => {
        el.innerText = "v" + initialVersion
    })

    try {
        await initializeModules();
        await fetch(
            "/serverStatus", {method: 'HEAD'}
        ).then(response => {
            if(!response.ok){
                $('#serverClosedModal').modal("show")
            }}
        ).catch(function(){
            $('#serverClosedModal').modal("show")
        })
        checkInternetConnection().catch(() => false)
        if (!RasterFunctions || !DatabaseFunctions || !DownloaderFunctions) {
            throw new Error('Startup modules failed to initialize')
        }
        RasterFunctions.setupListeners()
        DatabaseFunctions.setupListeners();

    // a quick POC that won't run because mapIt is already defined inside of the myDownloaderFunctions
    // the following lines can be commented out for a quick test
    
    //const mapIt2 = new (await import("/static/SubComponents/JsComponents/leafletComponent.mjs")).default
    //mapIt2.subscribe((shapefileFeatureGroup) => {
    //        console.log("Value changed to:", shapefileFeatureGroup);
    //});
    //mapIt2.shapefileFeatureGroup = Math.random().toString(10)
    //mapIt2.shapefileFeatureGroup = Math.random().toString(15)
  //TODO: This will have to be further looked in the scenario where sapoly.geojson is not immediately accessible
    await DownloaderFunctions.setupDownloader()

    await getDatabaseTemplateCatalog()
    const portalVersionInfo = window.portalVersionInfo || await getLocalVersionInfo()

    window.portalVersionInfo = portalVersionInfo
    let curVersion = portalVersionInfo.ApplicationVersion

    if (curVersion === '0.0.0.0') {
        fetch('/tlogger/debug:Test%20Version%20Detected')
        verTest = false
    }
    if (!curVersion) {
        curVersion = 'unknown'
    }

    //Set the version number for every element that is expecting updates
    let versionTexts = document.getElementsByClassName("versionNumText")
    Array.from(versionTexts).forEach((el) => {
        el.innerText = "v" + curVersion
    })

    checkForPortalUpdate(curVersion).catch(() => {
        fetch('/tlogger/warning:Unable%20to%20complete%20version%20check')
    })
    } catch (error) {
        console.error("Startup initialization failed", error)
        fetch('/tlogger/warning:Startup%20initialization%20failed').catch(() => {})
    } finally {
        finishLoading()
    }
}


/**Used to select all checkboxes.*/
function selectDeselectAll(elementClass, masterCheckbox){
    let master = document.getElementById(masterCheckbox)
    var checkboxes = document.getElementsByClassName(elementClass);
    if(master.checked){
        for(var i=0; i<checkboxes.length; i++){
            if(checkboxes[i].type=='checkbox'){
                checkboxes[i].checked=true;
            }
        }
    }
    else{
        for(var i=0; i<checkboxes.length; i++){
            if(checkboxes[i].type=='checkbox')
                checkboxes[i].checked=false;
        }
    }
    if(elementClass == 'dataCheckbox'){
        getSelectedCheckboxes(dbTableId)
    }
    else{
        getSelectedCheckboxes(importTableId)
    }
}

/**Used to return the current time Format is hh:mm:ss.ms*/
function currentTime(){
    var time = new Date()
    var displayTime = time.getHours() + ":" + time.getMinutes() + ":" + time.getSeconds() + "." + time.getMilliseconds()
    return displayTime
}

//---------------------Help Pane toggles-------------------------
async function toggleContactUs() {
    //contactUsHelpPaneContent is the id for the ContactUs content found in the HTML file
    toggleHelpPaneContent('contactUsHelpPaneContent')
    let logFileLocation = document.getElementById('logFileLocation')
    // send request out to get the log file location. Only do this the first opening.
    if (logFileLocation.innerText == ""){
        await fetch("/logFile", {
            method : 'GET'
        }).then((response) => response.text())
        .then(function(text){
            logFileLocation.innerText = text.toString()
        })
    }
}

function showCustomMessage(message) {
    // Create a new <div> element
    const customMessageDiv = document.createElement("div");

    // Set the message content
    customMessageDiv.textContent = message;

    // Add styling (optional)
    customMessageDiv.style.backgroundColor = "#f0f0f0";
    customMessageDiv.style.padding = "10px";
    customMessageDiv.style.border = "1px solid #ccc";

    // Append the <div> to a container (e.g., the body)
    document.body.appendChild(customMessageDiv);

    // Optionally, remove the message after a few seconds
    setTimeout(() => {
        document.body.removeChild(customMessageDiv);
    }, 3000); // Remove after 3 seconds (adjust as needed)
}

function toggleHelpPaneContent(elementId) {
    let helpPaneContainerParent = document.getElementById('helpPaneContainer')
    let helpPageContainers = helpPaneContainerParent.querySelectorAll('.helpPageContainer');
    helpPageContainers.forEach(function(node) {
        node.setAttribute('style', 'display: none')
    })

    let toggledContent = document.getElementById(elementId)
    toggledContent.setAttribute('style', 'display: block')

    const versionInfo = window.portalVersionInfo || {}
    document.getElementById("applicationVersion").innerHTML = versionInfo.ApplicationVersion || BrowserStorage.getCookie("ApplicationVersion")
    document.getElementById("sqliteSSURGOTemplateVersion").innerHTML = versionInfo.SQLiteSSURGOTemplateVersion || BrowserStorage.getCookie("SQLiteSSURGOTemplateVersion")
    document.getElementById("ssurgoVersion").innerHTML = versionInfo.SSURGOVersion || BrowserStorage.getCookie("SSURGOVersion")
}

$("#limitFolderNavigation").on("change", function(e){
    let value = this.value === "true"
    BrowserStorage.setLocalStorage("limitnavigationdepth", value)
    executeFolderTreeRequest(importTreeViewTable.tableId, rootPath, false, updatedValue('ssaSearchTextbox'))
    selectLimitNavigationOptions(value)
})

$(".helpPaneBtn").click(function(){
    let clickedButton = this.id
    $(".helpPaneContainer").toggle();
    $("#closeHelpMenu").focus()
    $("#helpPaneContainer").attr("aria-hidden", "false")
    //Set a value to refocus the previous element after closing the element.
    $("#closeHelpMenu").attr("previousFocus", clickedButton)
})

$("#closeHelpMenu").click(function(){
    $(".helpPaneContainer").toggle();
    let previousFocus = $("#closeHelpMenu").attr("previousFocus")
    $(`#${previousFocus}`).focus()
    $("#helpPaneContainer").attr("aria-hidden", "true")
})

//Keyboard trap for help menus (508)
$(".lastHelpMenuItem").on('keydown', function(e) {
    //If tab key without shift key or enter key is pressed:
    if((e.key == "Tab" && !e.shiftKey) || e.key == "Enter"){
        e.preventDefault()
        $("#closeHelpMenu").focus()
    }
})

//Keyboard trap for Version notification (508)
$("#downloadButton").on('keydown', function(e) {
    //If tab key is pressed without having shift also pressed:
    if(e.key == "Tab" && !e.shiftKey){
        e.preventDefault()
        $("#closeVersionModalBtn").focus()
    }
})

/*Rotates image when sub header section is expanded */
$(".containsSubHeaders").click(function(){
    if($(this).find("> button").attr("aria-expanded") == 'true'){
        //Targetting the direct child button's direct child image
        $(this).find('> button').find('> img').css("transform", "rotate(180deg)")
    }
    else{
        $(this).find('> button').find('> img').css("transform", "rotate(90deg)")
    }
})

/*Rotates the Expand the help menu image */
$("#expandHelpMenu").click(function(){
    if($(this).attr('status') == 'colapsed'){
        $(this).attr('status', 'expanded')
        $(this).find('img').css('transform', 'rotate(90deg)')
        $(this).find('img').attr('alt', 'Colapse Help Menu Icon')
        $(".helpPaneContainer").width("100%")
        $("#SSURGOLocationExample").css({"margin":"10px auto"})
    }
    else{
        $(this).attr('status', 'colapsed')
        $(this).find('img').css('transform', 'rotate(-90deg)')
        $(this).find('img').attr('alt', 'Expand Help Menu Icon')
        $(".helpPaneContainer").width("350px")
        $("#SSURGOLocationExample").css({"margin-left":"-70px"})
    }
})
//-------------------------Switch input toggles----------------------
function togglePath(clickableContainer, editableContainer){
    $(`#${clickableContainer}`).toggle()
    $(`#${editableContainer}`).toggle()
    if($(`#${editableContainer}`).is(':visible')){
        $(`#${editableContainer}`).focus()
    }
}

/**Method to toggle the attributes of the editable path when the user toggles between the button and editable paths */
function togglePathIcon(event){
    let img = $(event).find('img')
    if(img.attr('src') == '/static/images/changePathToEdit.svg'){
        img.attr('src', '/static/images/checkmarkHollow.svg')
        img.attr('alt', 'Switch to selectable path input')
        $(event).attr('aria-label', 'Switch to selectable path input')
        $(event).attr("style", "top:2px;")
    }
    else{
        img.attr('src', '/static/images/changePathToEdit.svg')
        img.attr('alt', 'Switch to typeable path input')
        $(event).attr('aria-label', 'Switch to typeable path input')
        $(event).attr("style", "top:-5px;")
    }
}

$("#displayTreePath").click(function(){
    togglePath("clickablePathContainer", "databaseTextBox")
    togglePathIcon(this)
})

$("#ssaDisplayTreePath").click(function(){
    togglePath("ssaClickablePathContainer", "ssaTextBox")
    togglePathIcon(this)
})

$("#downloadDisplayTreePath").click(function(){
    togglePath("downloadClickablePathContainer", "downloadTextBox")
    togglePathIcon(this)
})

//---------------------Select Database & Select Parent SSA Folder Page Toggles---------------------
//Toggle to display the Select Database Page
$("#selectDatabaseBrowseBtn").click(function(){
    $("#landingPageBackBtn, #databaseFolderTreeFooter, #helpPaneContainer").show() //toggle display on
    $("#homePageContainer").hide() //toggle display off
    document.getElementById('helpPaneContainer').setAttribute("style", "display: none") //don't display help menu if it was previously open
    if($("#expandHelpMenu").attr("status") == "expanded"){
        //If the help menu is set to the expanded view, collapse it
        $("#expandHelpMenu").click()
    }
    $('#selectDatabasePageBackBtn').attr('lastView', 'homePageContainer')
    $('#landingPageBackBtn').focus()
})

Array.from(document.getElementsByClassName("downloadFromWebBtn")).forEach(el => el.addEventListener('click', async function(){
    //For each element with the class "downloadFromWebBtn" add a listener that will check the internet connection and 
    //Display a message if not.
    await checkInternetConnection()
    $("#homePageContainer").hide()
    $("#downloadPageContainer").show()
    if($("#expandHelpMenu").attr("status") == "expanded"){
        //If the help menu is set to the expanded view, collapse it
        $("#expandHelpMenu").click()
    }
    if (DownloaderFunctions?.mapIt?._map) {
        DownloaderFunctions.mapIt._map.invalidateSize()
    }
    $('#downloadPageBackBtn').focus()
}))


//Toggle to close the Select Database Page
$("#selectDatabasePageBackBtn").click(function(){
    let lastView = $(this).attr('lastView')
    $(`#selectDatabasePage, #${lastView}`).toggle()
    document.getElementById('helpPaneContainer').setAttribute("style", "display: none") //don't display help menu if it was previously open
    document.getElementById('helpPaneContainer').setAttribute("status", "expanded")
    if($("#expandHelpMenu").attr("status") == "expanded"){
        $("#expandHelpMenu").click()
    }
})

//Toggle to display the Select SSA Parent Folder Page
$("#selectedFolderNameBrowseBtn, #selectImportFolderCardBtn").click(function(){
    $("#selectSSAPage, #homePageContainer").toggle()
    document.getElementById('helpPaneContainer').setAttribute("style", "display: none") //don't display help menu if it was previously open
    document.getElementById('helpPaneContainer').setAttribute("status", "expanded")
    if($("#expandHelpMenu").attr("status") == "expanded"){
        $("#expandHelpMenu").click()
    }
})

//Toggle to close the Select SSA Parent Folder Page when the Finalize button is clicked
$("#selectSsurgoFolderFinalizeBtn").click(function(){
    $("#selectSSAPage, #homePageContainer").toggle()
    document.getElementById('helpPaneContainer').setAttribute("style", "display: none") //don't display help menu if it was previously open
    document.getElementById('helpPaneContainer').setAttribute("status", "expanded")
    if($("#expandHelpMenu").attr("status") == "expanded"){
        $("#expandHelpMenu").click()
    }
})

//Toggle to close the Select SSA Parent Folder Page
$("#selectSSAPageBackBtn").click(function(){
    $("#selectSSAPage, #homePageContainer").toggle()
    document.getElementById('helpPaneContainer').setAttribute("style", "display: none") //don't display help menu if it was previously open
    document.getElementById('helpPaneContainer').setAttribute("status", "expanded")
    if($("#expandHelpMenu").attr("status") == "expanded"){
        $("#expandHelpMenu").click()
    }
})

//Toggle to display the Select SSA Parent Folder Page
$("#selectedDownloadFolderNameBrowseBtn").click(function(){
    $("#selectDownloadPage, #downloadPageContainer").toggle()
    document.getElementById('helpPaneContainer').setAttribute("style", "display: none") //don't display help menu if it was previously open
    document.getElementById('helpPaneContainer').setAttribute("status", "expanded")
    if($("#expandHelpMenu").attr("status") == "expanded"){
        $("#expandHelpMenu").click()
    }
})

// Handles "Go Back" functionality from SSA Downloads page
$("#selectDownloadPage").click(function(){
    if (DownloaderFunctions?.mapIt?._map) {
        DownloaderFunctions.mapIt._map.invalidateSize(true); // refresh map size
    }
})


//Toggle to close the Select SSA Parent Folder Page
$("#selectDownloadPageBackBtn").click(function(){
    $("#selectDownloadPage, #downloadPageContainer").toggle()
    document.getElementById('helpPaneContainer').setAttribute("style", "display: none") //don't display help menu if it was previously open
    document.getElementById('helpPaneContainer').setAttribute("status", "expanded")
    if($("#expandHelpMenu").attr("status") == "expanded"){
        $("#expandHelpMenu").click()
    }
    $("#downloadPageBackBtn").focus()
    if (DownloaderFunctions?.mapIt?._map) {
        DownloaderFunctions.mapIt._map.invalidateSize(true); // refresh map size
    }
})

//Toggle to close the Progress Modal by clicking the 'Next' Button
$("#closeProgressModal").click(function(){
    $("#homePageContainer, #selectDatabasePage").toggle()
    document.getElementById('helpPaneContainer').setAttribute("style", "display: none") //don't display help menu if it was previously open
    document.getElementById('helpPaneContainer').setAttribute("status", "expanded")
    if($("#expandHelpMenu").attr("status") == "expanded"){
        $("#expandHelpMenu").click()
    }
})

//---------------------Tree View Search bar toggles-------------------------
//Toggle search field for Create New Database
$("#newDatabaseSearchBtn").click(function(){
    $("#newDatabaseSearchBtn, #newDatabaseSearch").toggle()
})
$("#newDatabaseSearchTextBtn").click(function(){
    $("#newDatabaseSearch, #newDatabaseSearchBtn").toggle()
})

//Toggle search field for Existing Database
$("#databaseSearchBtn").click(function(){
    $("#databaseSearchBtn, #databaseSearch").toggle()
})

$("#databaseSearchTextBtn").click(function(){
    $("#databaseSearch, #databaseSearchBtn").toggle()
})

//Toggle search field for Existing Database Modal
$("#databaseSearchBtnModal").click(function(){
    $("#databaseSearchBtnModal, #databaseSearchModal").toggle()
})
$("#databaseSearchTextBtnModal").click(function(){
    $("#databaseSearchModal, #databaseSearchBtnModal").toggle()
})
//Toggle search field for SSA Modal
$("#ssaSearchBtn").click(function(){
    $("#ssaSearchBtn, #ssaSearchContainer").toggle()
})
$("#ssaSearchTextBtn").click(function(){
    $("#ssaSearchContainer, #ssaSearchBtn").toggle()
})

//--------------Toggles for Advanced Options--------------
$("#importNavLink").click(function(){
    $("#selectDatabaseContainer, #importOptionsContainer, #selectFolderContainer").show()
    $("#databaseOptionsContainer, #sdvOptionsContainer, #selectDownloadFolderContainer").hide()
})

$("#databaseNavLink").click(function(){
    $("#selectDatabaseContainer, #databaseOptionsContainer, #selectFolderContainer").show()
    $("#importOptionsContainer, #sdvOptionsContainer, #refreshBtn, #selectDownloadFolderContainer").hide()
})

$("#sdvNavLink").click(function(){
    $("#selectDatabaseContainer, #sdvOptionsContainer").show()
    $("#importOptionsContainer, #databaseOptionsContainer, #selectFolderContainer, #refreshBtn, #selectDownloadFolderContainer").hide()
})

// Toggles for showing content either under the 'Attribute/Folder Description' or 'Rating Options' tab
$("#attributeFolderBtn").click(function(){
    $("#sdvDescriptionsContainer").show()
    $("#sdvRatingOptionsContainer").hide()
})

// Initialize all instances of Popover
var popoverTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="popover"]'))
var popoverList = popoverTriggerList.map(function (popoverTriggerEl) {
    return new bootstrap.Popover(popoverTriggerEl)
})

//--------------------General Functions----------------------

/**Reach out to the python server to have it execute a request and see if WSS can be accessed.*/
async function checkInternetConnection(isButton = false){

    function displayNoInternet(){
        //WSS cannot be reached.
        $("#noInternetConnectionContainer").show()
        $("#downloadMapContainer, #internetDownloadContainer, #downloadOptions, #downloadPageContainer>.subpage-display--footer").hide()
        if(isButton){
            //This prevents the alert from displaying on first load and requires the user to click a button.
            alert("Unable to contact download servers")
        }
        fetch('/tlogger/warning:'+'Host%20unable%20to%20talk%20to%20WSS')
        return false
    }

    function displayNoSapoly(){        
        $("#noGeojsonFileContainer").show()
        $("#downloadMapContainer, #internetDownloadContainer, #downloadOptions, #downloadPageContainer>.subpage-display--footer").hide()
    }

    async function sapolyExists(){
        const headResult = await fetch('/static/sapoly.geojson', { method: 'HEAD' })
            .then((response) => response.ok)
            .catch(() => false)

        if(headResult){
            return true
        }

        return fetch('/static/sapoly.geojson')
            .then((response) => response.ok)
            .catch(() => false)
    }

    try{
        let geojsonFound = await sapolyExists()

        if(!geojsonFound){
            displayNoSapoly()
            return false
        }
        var test = await fetch('/checkInternet', {method:'GET'})
        .then((response) => response.json())
        .then(function(response){
            echo(response)
            if(response.wss_status_code == 200){
                //We are able to communicate with WSS            
                //loadExternalResources()
                $("#noInternetConnectionContainer").hide()
                $("#selectDatabaseContainer, #selectFolderContainer, #downloadOptions, #downloadMapContainer, #downloadPageContainer>.subpage-display--footer").show()
                fetch('/tlogger/debug:'+'Host can talk to WSS')
                if (DownloaderFunctions?.mapIt?._map) {
                    DownloaderFunctions.SSAGrp = L.featureGroup().addTo(DownloaderFunctions.mapIt._map);
                    DownloaderFunctions.mapIt._map.invalidateSize()
                }
                return true
            }
            else{
                return displayNoInternet()
            }
        })
    }
    catch(error){
        return displayNoInternet()
    }
}

$(window).on("resize", function(){
    /**An issue occurs in the map where the map tiles do not load if the window size changes. This addresses that issue.
     * TODO: This should also be implemented in the map-component.
     */
    if (DownloaderFunctions?.mapIt?._map) {
        DownloaderFunctions.mapIt._map.invalidateSize()
    }
})

/**Convert date object, returned by the Data Loader, into a MM/DD/YYYY format.*/
function formatDate(date){
    let unformattedDate = new Date(date)
    let month = unformattedDate.getMonth() + 1
    let day = unformattedDate.getDate()
    let year = unformattedDate.getFullYear()
    return (`${month}/${day}/${year}`)
}
/** Converts ms into a readable format (hh:mm:ss) */
function formatTime(time){
    let seconds = Math.round(time / 1000)
    let mins = Math.floor(seconds / 60)
    let hours = Math.floor(mins / 60)

    seconds = seconds % 60
    mins = mins % 60
    const readableTime = [
        hours.toString().padStart(2, "0"),
        mins.toString().padStart(2, "0"),
        seconds.toString().padStart(2, "0"),
    ].join(":")

    return readableTime
}

/**Adds a listener to the element that triggers the click function when the enter key is pressed*/
function addEnterEventListener(element){
    element.addEventListener("keypress", function(e){
        if(e.key == "Enter"){
            $(this).trigger("click")
        }
    })
}

/**Adds button functionality to elements that normaly would not have this. I.E. a table row is now tabbable and an enter key will trigger the on click event*/
function addButtonFunctionality(element){
    element.setAttribute("tabindex", 0)
    element.setAttribute("role", "button")
    addEnterEventListener(element)
}

/**For debugging. Simple console.log() action.*/
function echo(message){
    console.log(message)
}

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms))
}

function setRootPath(value){
    rootPath = value
}


try{
    module.exports = {
        checkInternetConnection,
        Table,
        TreeViewTable,
        CheckboxTable,
        ImportActivities,
        setDatabaseNameAndPath,
        initializeModules,
        buildImportTable,
        initializeTreeView,
        importTreeViewTable,
        setDuplicateToggleDisplay,
        setRootPath,
        populateSdvFolders,
        sortDateLogic,
        continuePathNavigation,
        doesPathExist,
        echo
    }
}
catch{}