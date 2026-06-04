import BrowserStorageFunctions from "./BrowserStorageFunctions.mjs";

//Feature flags
export const showSdvResultsFlag = false;
export const enableShapefileDownload = false;
export const enableSsaVersionCheck = true;

export const url = 'http://localhost:8083/SSURGOPortalUI'
export const fileCheckUrl = 'http://localhost:8083/fileExists'
//Database Inventory Table Constants
export const dbTableId = 'databaseTable'
export const dbTableContainer = 'dbTableContainer'
export const dbTableCaption = 'SSURGO Data in Database Table'
//Name of columns and their onclick events
export const dbTableHeaders = {
    'Area Symbol' : ["sortTable(1, 'databaseTableBody', true, 'text')", "Area Symbol of SSURGO in database"],
    'Area Name' : ["sortTable(2, 'databaseTableBody', true, 'text')", "Area Name of SSURGO in database"],
    'SSURGO Version Date' : ["sortTable(3, 'databaseTableBody',true, 'date')", "Version date for \r SSURGO data \r in database"],
    'Tabular Only' : ["sortTable(4, 'databaseTableBody', true, 'tabularOnly')", "Indicates \r that only \r tabular data \r exists for \r area symbol"]
}
//SSA Inventory Table Constants
export const importTableId = 'importTable'
export const importTableContainer = 'importTableContainer'
export const importTableCaption = 'Import SSURGO Data'

//Name of columns and their onclick events
export const importTableHeaders = {
    'Folder Name' : [`sortTable(1, '${importTableId}', true, 'text', 'tbody')`, "Name of folder containing SSURGO data"],
    'Area Symbol' : [`sortTable(2, '${importTableId}', true, 'text', 'tbody')`, "Area Symbol of SSURGO in the folder"],
    'Area Name' : [`sortTable(3, '${importTableId}', true, 'text', 'tbody')`, "Area Name of SSURGO in the folder"],
    'Folder SSURGO Version Date' : [`sortTable(4, '${importTableId}', true, 'date', 'tbody')`, "Version date of SSURGO data in folder"],
    'Exists in Database' : [`sortTable(5, '${importTableId}', true, 'versionCheck', 'tbody')`, "Indicates SSURGO area \r symbol in folder already \r exists in database"],
    'Database SSURGO Version Date' : [`sortTable(6, '${importTableId}', true, 'date', 'tbody')`, "Version date \r for SSURGO \r data in \r database"]
}
//Constants to determine which part of the page is being populated by the folder tree
    //If modified the html will also have to follow suit in places where correlated javascript methods are called I.E. executeFolderTreeRequest and initializeTreeView
export const openDatabaseLocation = 'openDatabaseLocation'
export const databaseTreeViewTableId = 'databaseTreeViewTable'
export const databaseTreeViewTableCaption = 'Select or Create a Database'
export const importTreeViewTableId = 'importTreeViewTable'
export const importTreeViewTableCaption = 'Select Folder of SSURGO Data'
export const downloadTreeViewTableId = 'downloadTreeViewTable'
export const downloadTreeViewTableCaption = 'Select Download Folder for SSURGO Data'
export const ssaFolderLocation = 'ssaFolderLocation'
//Name of columns and their onclick events
export const databaseTreeViewHeaders = {
    'Name' : "doubleSort(0, 'databaseTreeViewTableFolderSection', 'databaseTreeViewTableFileSection', 'text')",
    'Date modified' : "doubleSort(1, 'databaseTreeViewTableFolderSection', 'databaseTreeViewTableFileSection', 'date')",
    'Type' : "sortTable(2, 'databaseTreeViewTableFileSection', false, 'text')",
    'Size' : "sortTable(3, 'databaseTreeViewTableFileSection', false, 'fileSize')"}

export const ssurgoTreeViewHeaders = {
    'Name' : "sortTable(0, 'importTreeViewTableFolderSection', false, 'text')",
    'Date modified' : "sortTable(1, 'importTreeViewTableFolderSection', false, 'date')"
}

export const downloadTreeViewHeaders = {
    'Name' : "sortTable(0, 'downloadTreeViewTableFolderSection', false, 'text')",
    'Date modified' : "sortTable(1, 'downloadTreeViewTableFolderSection', false, 'date')"
}
export const ratingTableHeaders = {
    'Area Symbol' :             "sortRating('areasymbol')"//[`sortTable(0, 'ratingTbody', false, 'text')`]// , 'Sort Area Symbol'
    ,'Map Unit Symbol' :        [`sortTable(1, 'ratingTbody', false, 'text')`]// , 'Sort Map Unit Symbol'
    ,'Map Unit Name' :          [`sortTable(2, 'ratingTbody', false, 'text')`]// , 'Sort Map Unit Name'
    ,'Rating' :                 "sortRating('rating')"//[`sortTable(3, 'ratingTbody', false, 'text')`]// , 'Sort Rating' //Need to configure logic for setting the rating sorting.
    ,'Percent of Map Unit' :    [`sortTable(4, 'ratingTbody', false, 'fileSize')`]// , 'Sort Percent of Map Unit'
}
//Constants for requests going to Data Loader
export const databaseTableRequest = 'getdatabaseinventory'
export const createTemplateDatabaseRequest = 'createTemplateDatabase'
export const copyTemplateFileRequest = 'copytemplatefile'
export const deleteAreaSymbolRequest = 'deleteareasymbols'
export const getFolderTreeRequest = 'getfoldertree'
export const pretestImportCandidatesRequest = 'pretestimportcandidates'
export const importCandidatesRequest = 'importcandidates'
export const generateRastersRequest = 'generaterasters'
export const getTemplateCatalogRequest = 'gettemplatecatalog'
export const getSDVAttributesByFolderRequest = 'getsdvattributesbyfolder'
export const getSDVRatingOptions = 'getsdvratingoptions'
export const generateAggregationRequest = 'generateaggregation'
export const bulkSSADownload = 'bulkssadownload'

export const SDA_POSTREST_URL = BrowserStorageFunctions.getUrlCookie("sdaPostRestUrl")
export const osPathSep = BrowserStorageFunctions.getOsPathSep()