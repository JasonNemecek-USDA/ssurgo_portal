import LeafletComponent from "./leafletComponent.mjs";
import BrowserStorage from "./BrowserStorageFunctions.mjs";
export default class DownloaderFunctions{
    static enableShapefileDownload = false;
    static enableVerboseWorkerLogs = false;
    static stateButton = document.querySelector('[aria-controls="a1"]');
    static keywordButton = document.querySelector('[aria-controls="a2"]');
    static shapefileButton = document.querySelector('[aria-controls="a3"]');
    static downloadButton = document.getElementById('downloadBtn')
    static a1 = document.getElementById('a1');
    static a2 = document.getElementById('a2');
    static a3 = document.getElementById('a3');
    static srchSpinner = document.getElementById('ssaLoadingScreen');
    static mapTip = document.getElementById('mapTooltip');
    static worker = new Worker("/static/js/ssa-downloader.mjs", {type: 'module'});
    static workerHandlersAttached = false;

    constructor(SDA_POSTREST_URL){
        this.mapIt = new LeafletComponent()
        this.isDrawing = undefined
        this.mapLayerDrawn = undefined
        this.successAreas = [];
        this.failedAreas = [];
        this.selectedRegions = [];
        this.deletedStates = [];
        this.deleteMethod = undefined;
        this.aoiRegions = [];
        this.ssaRunTotal = 0;
        this.latestDownloadTelemetry = null;
        this.latestGovernorState = null;
        this.SDA_POSTREST_URL = SDA_POSTREST_URL
        this.mapIt.shapefileFeatureGroup = new L.FeatureGroup().addTo(this.mapIt._map)
        this.mapIt.SSAGrp = L.featureGroup().addTo(this.mapIt._map)

        //Add class bindings
        this.importPolygonHoverController = this.importPolygonHoverController.bind(this)
        this.mouseOverPointInPolygon = this.mouseOverPointInPolygon.bind(this)
        this.initializeMap = this.initializeMap.bind(this)
        this.ssaDelete = this.ssaDelete.bind(this)
        this.workerEvents = this.workerEvents.bind(this)
        this.workerErrorEvents = this.workerErrorEvents.bind(this)
        this.getSSAByFile = this.getSSAByFile.bind(this)

        document.getElementById("ssaselector").DownloaderFunctionsItems = this

        this.mapIt._map.on('mousemove', (e)=>{
            this.mouseOverPointInPolygon(this.mapLayerDrawn, e);
            this.mouseOverPointInPolygon(this.mapIt.shapefileFeatureGroup, e);
        })

        this.mapIt._map.on("zoomend", (e)=> { 
            this.mapIt.mapLayerSSA.setStyle((e)=> {
                if (this.selectedRegions.includes(e.properties.areasymbol)) {
                    return {
                        fillOpacity: 0.5,
                        weight: this.mapIt.calculateBorderWeight(),
                        fillColor: '#FFD580',
                        color: 'black' 
                    }
                } else {
                    return {
                        fillOpacity: 0,
                        weight: this.mapIt.calculateBorderWeight(),
                        color: 'darkgray' 
                    }
                }
            });
            this.mapIt.stateLayer.setStyle({
                    weight: this.mapIt.calculateBorderWeight() * 3
                }
            );
        });
    }
    comboBoxEvent(event){
        const selectedValue = event.target.value;
        if(selectedValue != ''){
            const selectedOption = event.target.selectedOptions[0];
            const selectedText = selectedOption.text;
            if(selectedValue === '__ALL__'){
                this.getSSAByKeyword('%');
                return;
            }

            if(selectedValue === '__CONUS__'){
                this.getSSAByKeyword('CONUS');
                return;
            }

            this.getSSAByState(selectedValue, selectedText);
        }
    }

    async setupDownloader(){
        this.mapIt.shapefileFeatureGroup = new L.FeatureGroup().addTo(this.mapIt._map)
        this.mapIt.SSAGrp = L.featureGroup().addTo(this.mapIt._map)
        this.setupWorker()
        //feature flag for the shapefile
        if(!DownloaderFunctions.enableShapefileDownload){DownloaderFunctions.shapefileButton.style.display = "none"};

        const comboBox = document.getElementsByName('stateSelect')[0];
        comboBox.addEventListener('change', (event) => {
            this.comboBoxEvent(event)
        });
        DownloaderFunctions.downloadButton.addEventListener('click', ()=>{
            this.downloadCandidates()
        })
    
        const srchButton = document.getElementById('srchButton');
        const keywordSrch = document.getElementById('keyword');
        srchButton.addEventListener('click', () => {
            const keyword = keywordSrch.value;
            this.getSSAByKeyword(keyword);
        });
        keywordSrch.addEventListener('keydown', (event) => {
            if(event.key === 'Enter'){
                event.preventDefault();
                this.getSSAByKeyword(keywordSrch.value);
            }
        });
        this.setDownloaderEventListeners()
        this.isDrawing = false;
        await this.initializeMap()
    }
    setupWorker(){
        //Send cookies to downloader.
        DownloaderFunctions.worker.postMessage({"command" : "return-urls", "urls" : {"wssDownloadUrl" : BrowserStorage.getUrlCookie('wssDownloadUrl'), "sdaPostRestUrl" : BrowserStorage.getUrlCookie("sdaPostRestUrl")}})
        if(DownloaderFunctions.workerHandlersAttached){
            return
        }

        DownloaderFunctions.worker.addEventListener("message", (e) => {this.workerEvents(e)});
        DownloaderFunctions.worker.addEventListener("error", (e) => {this.workerErrorEvents(e)});
        DownloaderFunctions.worker.addEventListener("messageerror", (e) => {this.workerErrorEvents(e)});
        DownloaderFunctions.workerHandlersAttached = true
    }

    workerErrorEvents(event){
        const progressDisplayComp = document.getElementById("progressdisplay");
        const eventMessage = String(event?.message ?? event?.type ?? 'Worker error')

        document.getElementById('downloadBtn').disabled = false;
        progressDisplayComp.populateErrorMessage(`<b>Error Message:</b> ${eventMessage}`);
        progressDisplayComp.stop(this.successAreas, this.failedAreas, 'download', false);
        progressDisplayComp.removeEventListener("onStopAction", DownloaderFunctions.handleStopDownload);
    }

    static normalizeDownloadPath(path){
        const normalized = String(path ?? '').trim().replaceAll('\\', '/');
        if(!normalized){
            return '';
        }

        // Keep drive roots stable (C:/) while trimming trailing separators elsewhere.
        if(/^[A-Za-z]:\/?$/.test(normalized)){
            return normalized.replace(':/', ':') + '/';
        }

        return normalized.replace(/\/+$/, '');
    }

    static isDriveRootPath(path){
        return /^[A-Za-z]:\/?$/.test(path);
    }

    async validateDownloadDestination(folderPath){
        if(!folderPath){
            return {
                success: false,
                message: 'Select a download folder before starting.'
            }
        }

        if(DownloaderFunctions.isDriveRootPath(folderPath)){
            return {
                success: false,
                message: 'The root of a drive is not a valid download target. Choose a writable subfolder, for example C:/Users/<you>/Downloads/SSURGO.'
            }
        }

        try{
            const response = await fetch('/validateDownloadFolder', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({location: folderPath}),
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
            return {
                success: false,
                message: `Unable to validate download folder: ${error?.message ?? error}`
            }
        }
    }

    async runDownloadPreflight(folderPath, selectedAreaCount){
        const normalizedCount = Number.isFinite(selectedAreaCount)
            ? Math.max(0, selectedAreaCount)
            : 0
        const minFreeDiskMb = Math.max(4096, Math.ceil(normalizedCount * 80))
        const minAvailableMemoryMb = 1024

        try{
            const response = await fetch('/preflightDownload', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({
                    location: folderPath,
                    minFreeDiskMb,
                    minAvailableMemoryMb,
                }),
            })

            if(!response.ok){
                return {
                    success: false,
                    message: `Unable to run preflight checks (${response.status}).`,
                }
            }

            const payload = await response.json()
            if(payload?.success){
                return {
                    success: true,
                    message: payload?.message ?? 'Preflight checks passed.',
                }
            }

            return {
                success: false,
                message: payload?.message ?? 'Preflight checks failed.',
            }
        }
        catch(error){
            return {
                success: false,
                message: `Unable to run preflight checks: ${error?.message ?? error}`,
            }
        }
    }

    async getDefaultDownloadDestination(){
        try{
            const response = await fetch('/defaultDownloadFolder', {method: 'GET'})
            if(!response.ok){
                return {
                    success: false,
                    message: `Unable to resolve default download folder (${response.status}).`
                }
            }

            const payload = await response.json()
            if(payload?.success && typeof payload.path === 'string'){
                return {
                    success: true,
                    path: DownloaderFunctions.normalizeDownloadPath(payload.path),
                    source: 'default download folder'
                }
            }

            return {
                success: false,
                message: payload?.message ?? 'Unable to resolve default download folder.'
            }
        }
        catch(error){
            return {
                success: false,
                message: `Unable to resolve default download folder: ${error?.message ?? error}`
            }
        }
    }

    async resolveDownloadDestination(rawFolderPath){
        const primaryPath = DownloaderFunctions.normalizeDownloadPath(rawFolderPath)
        const fallbackPath = DownloaderFunctions.normalizeDownloadPath(
            BrowserStorage.getLocalStorage('downloadpath')
        )
        const databaseFolderPath = DownloaderFunctions.normalizeDownloadPath(
            BrowserStorage.getLocalStorage('getdatabaseinventory')
        )

        const candidatePaths = [
            {path: primaryPath, source: 'selected folder'},
            {path: fallbackPath, source: 'last used download folder'},
            {path: databaseFolderPath, source: 'selected database folder'},
        ]

        let lastFailureMessage = 'Unable to determine a valid download folder.'
        const seen = new Set()
        for(const candidate of candidatePaths){
            if(!candidate.path || seen.has(candidate.path)){
                continue
            }

            seen.add(candidate.path)
            const validation = await this.validateDownloadDestination(candidate.path)
            if(validation.success){
                return {
                    success: true,
                    path: candidate.path,
                    source: candidate.source,
                }
            }

            lastFailureMessage = validation.message ?? lastFailureMessage
        }

        const defaultDestination = await this.getDefaultDownloadDestination()
        if(defaultDestination.success){
            const validation = await this.validateDownloadDestination(defaultDestination.path)
            if(validation.success){
                return {
                    success: true,
                    path: defaultDestination.path,
                    source: defaultDestination.source,
                }
            }

            lastFailureMessage = validation.message ?? lastFailureMessage
        }
        else if(defaultDestination.message){
            lastFailureMessage = defaultDestination.message
        }

        return {
            success: false,
            message: lastFailureMessage,
        }
    }

    workerEvents(e){
        const progressDisplayComp = document.getElementById("progressdisplay");
        const ssaSelector = document.getElementById('ssaselector');
        const areaSymbols = (ssaSelector && typeof ssaSelector.getAreaSymbols === 'function')
            ? ssaSelector.getAreaSymbols()
            : [];
        const totalAreas = Array.isArray(areaSymbols) ? areaSymbols.length : 0;
        switch(e.data.name){
            case "download-complete":
                //make download button available
                document.getElementById('downloadBtn').disabled = false;
                progressDisplayComp.stop(this.successAreas, this.failedAreas, 'download', true);
                progressDisplayComp.removeEventListener("onStopAction", DownloaderFunctions.handleStopDownload);
                break;
            case "download-cancelled": {
                //make download button available
                document.getElementById('downloadBtn').disabled = false;
                const cancelReason = e.data?.reason ?? e.data?.code ?? 'user_cancelled';
                const cancelMessage = e.data?.message ?? 'Download cancelled.';
                progressDisplayComp.populateErrorMessage(`<b>Download Cancelled:</b> ${cancelMessage} (<b>reason:</b> ${cancelReason})`);
                progressDisplayComp.stop(this.successAreas, this.failedAreas, 'download', false);
                progressDisplayComp.removeEventListener("onStopAction", DownloaderFunctions.handleStopDownload);
                break;
            }
            case "download-status": {
                const fileObj = e.data.file ?? {};
                const areaSymbol = fileObj.areaSymbol ?? fileObj.fileName ?? 'Unknown area';
                const fileName = fileObj.fileName ?? areaSymbol;
                const errorMessage = e.data.message ?? 'failed download.';
                const errorCode = e.data.code ? String(e.data.code) : 'download_failed';
                const stage = e.data.stage ? String(e.data.stage) : 'unknown';
                const retryableLabel = e.data.retryable === false ? 'non-retryable' : (e.data.retryable === true ? 'retryable' : 'retryability-unknown');
                if(e.data.success){                
                    if(DownloaderFunctions.enableVerboseWorkerLogs){
                        console.log(`${fileName} downloaded successfully`);
                    }
                    this.successAreas.push(areaSymbol);
                    progressDisplayComp.successValue++;                         
                    progressDisplayComp.progressCounterMessage = `${progressDisplayComp.successValue} out of ${totalAreas} Survey Areas downloaded. ${progressDisplayComp.failValue} downloads failed.`;
                    progressDisplayComp.populateSuccessMessage(`${areaSymbol} successfully downloaded.`);
                }else{
                    if(DownloaderFunctions.enableVerboseWorkerLogs){
                        console.log(`${fileName} download failed`);
                    }
                    this.failedAreas.push(areaSymbol);
                    progressDisplayComp.failValue++;                     
                    progressDisplayComp.progressCounterMessage = `${progressDisplayComp.successValue} out of ${totalAreas} Survey Areas downloaded. ${progressDisplayComp.failValue} downloads failed.`;                           
                    progressDisplayComp.populateErrorMessage(`${areaSymbol} <b>Error Message:</b> ${errorMessage} (<b>code:</b> ${errorCode}; <b>stage:</b> ${stage}; <b>type:</b> ${retryableLabel})`);
                }

                break;
            }
            case "download-error":
                //make download button available
                document.getElementById('downloadBtn').disabled = false;
                if(e.data?.message){
                    const errorCode = e.data?.code ? String(e.data.code) : 'download_error';
                    const stage = e.data?.stage ? String(e.data.stage) : 'unknown';
                    const retryableLabel = e.data?.retryable === false ? 'non-retryable' : (e.data?.retryable === true ? 'retryable' : 'retryability-unknown');
                    progressDisplayComp.populateErrorMessage(`<b>Error Message:</b> ${e.data.message} (<b>code:</b> ${errorCode}; <b>stage:</b> ${stage}; <b>type:</b> ${retryableLabel})`);
                }
                progressDisplayComp.stop(this.successAreas, this.failedAreas, 'download', false);
                progressDisplayComp.removeEventListener("onStopAction", DownloaderFunctions.handleStopDownload);
                break;
            case "download-telemetry": {
                this.latestDownloadTelemetry = e.data?.telemetry ?? null;
                if(DownloaderFunctions.enableVerboseWorkerLogs && this.latestDownloadTelemetry){
                    console.log("download telemetry", this.latestDownloadTelemetry);
                }
                break;
            }
            case "download-governor": {
                this.latestGovernorState = e.data?.governor ?? null;
                if(!this.latestGovernorState){
                    break;
                }

                if(this.latestGovernorState.severity === 'warning'){
                    progressDisplayComp.populateErrorMessage(
                        `<b>Throughput Governor:</b> ${this.latestGovernorState.message}`
                    );
                }

                if(DownloaderFunctions.enableVerboseWorkerLogs){
                    console.log("download governor", this.latestGovernorState);
                }
                break;
            }
            case "urls-set":
                fetch('/tlogger/info:urls%20sent%20to%20worker')
                break;
            case "message-received":
                break;
            default:
                console.error("Unknown message", e.data.name);
        }
    }
    static parseXML(data) {
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(data, 'text/xml');
    
        // Extract areasymbol values
        const tables = xmlDoc.getElementsByTagName('Table');
        const ssaCartStr = Array.from(tables).map((table) => {
            const areasymbolElement = table.getElementsByTagName('AREASYMBOL')[0];
            const areasymbolAREANAME = table.getElementsByTagName('AREANAME')[0];
            return areasymbolElement.textContent + ', ' + areasymbolAREANAME.textContent;
        });
        return ssaCartStr;
    }

    static removeAreasymbolByMap(areaSym) {
        document.getElementById("ssaselector").removeSurveyArea(areaSym);        
    }
    
    updatessaRunTotal() {
        let downloadButton = document.getElementById('downloadBtn');
        let nextBtn = document.getElementById("selectedDownloadFolderNameBrowseBtn")
    
        if(this.ssaRunTotal > 0) {
            downloadButton.disabled = false;
            nextBtn.disabled = false;
            nextBtn.setAttribute("aria-disabled", "false")
            nextBtn.setAttribute("title", "Click “Next” to select the download folder for SSURGO data.")
        }
        else {
            downloadButton.disabled = true;
            nextBtn.disabled = true;
            nextBtn.setAttribute("aria-disabled", "true")
            nextBtn.setAttribute("title", "Please select an SSA to continue.")
        }
    
        document.getElementById('ssaselector').runTotal = this.ssaRunTotal;
    }
    
    ssaDelete(e){
        
        // Communicates with SSASelector.js lit constructors and scopes in variables
        // Needs improvement I know
        const areaSymbols = e.detail.areaSymbols;
        this.deleteMethod = e.detail._method;
    
        if (e.detail.states){
            this.deletedStates = e.detail.states;
        }
    
        if(areaSymbols && areaSymbols.length >= 0){
            areaSymbols.forEach(symbol => {
    
                this.ssaRunTotal += -1;
                this.updatessaRunTotal();
                this.unhighlightAreasymbol(symbol);    
                const ssaIndex = this.selectedRegions.indexOf(symbol);
                if (ssaIndex > -1) {
                    this.selectedRegions.splice(ssaIndex, 1);
                }            
    
            })
        }
    }
    
    makeSSAList(symbols) {

        // Populate the <ul> with id="SSAList"
        let surveyAreas = [];

        let duplicates = [];    
        symbols.forEach(symbol => {

            const areasym = symbol.split(",")[0];
            if (this.selectedRegions.includes(areasym)) {
                duplicates.push(areasym);
                //continue;
            }else{
                surveyAreas.push({id: areasym, label: symbol})
                this.highlightAreasymbol(areasym);
                this.selectedRegions.push(areasym);
                this.ssaRunTotal += 1;
            }

        })


        if(duplicates.length > 0) {
            const dupMsg = duplicates.join(", ");
            //TODO: Replace with USWDS compatiple alert. Search on "usa-alert usa-alert--warning"
            alert(`Areasymbol(s) already in the list: ${dupMsg}.`);
        }
        this.updatessaRunTotal();
        this.zoomToselectedRegions();

        document.getElementById("ssaselector").surveyAreas 
            = [...document.getElementById("ssaselector").surveyAreas, ...surveyAreas];

    }

    highlightAreasymbol(areaSymbol) {
        if (!this.mapIt.mapLayerSSA) {
            return;
        }
        //eachLayer() also works when iterating over a .geojson file, use eachFeature() when iterating over web service features
        let clickedLayer = null;
        this.mapIt.mapLayerSSA.eachLayer((layer) => {
            if (layer.feature.properties.areasymbol === areaSymbol) {
                clickedLayer = layer;
            }
        });
        if(clickedLayer) {
            clickedLayer.setStyle({
                weight: this.mapIt.calculateBorderWeight('clicked item', 2),
                color: 'black', 
                fillColor: '#FFD580', 
                fillOpacity: 0.5
            });
        } else {
            console.error("Layer not found for: ", areaSymbol);
        }

    }

    unhighlightAreasymbol(areaSymbol) {
        //eventually moves to config file.
        const statesIslands = ['Alabama','Alaska','American Samoa','Arizona','Arkansas','California','Colorado','Connecticut','Delaware','District of Columbia','Federated States of Micronesia','Florida','Georgia','Guam','Hawaii','Idaho','Illinois','Indiana','Iowa','Kansas','Kentucky','Louisiana','Maine','Marshall Islands','Maryland','Massachusetts','Michigan','Minnesota','Mississippi','Missouri','Montana','Nebraska','Nevada','New Hampshire','New Jersey','New Mexico','New York','North Carolina','North Dakota','Northern Mariana Islands','Ohio','Oklahoma','Oregon','Palau','Pennsylvania','Puerto Rico','Rhode Island','South Carolina','South Dakota','Tennessee','Texas','Utah','Vermont','Virgin Islands of the U.S.','Virginia','Washington','West Virginia','Wisconsin','Wyoming'];

        if (!statesIslands.includes(areaSymbol)) {
            //use getLayers() when iterating over a .geojson file, use eachFeature() when iterating over web service features 
            const clickedLayer = this.mapIt.mapLayerSSA.getLayers().find(layer => {
                return layer.feature.properties.areasymbol === areaSymbol;
            });
            if(clickedLayer) {
                clickedLayer.setStyle({             
                    weight: this.mapIt.calculateBorderWeight('unclicked item', 1), 
                    color: 'gray', 
                    fillColor: '#FFD580', 
                    fillOpacity: 0
                });
                clickedLayer.bringToFront();
            } else {
                console.error("Layer not found for: ", areaSymbol);
            }
        }
    }

    // Function to zoom to selected regions
    async zoomToselectedRegions() {
        let selectedLayers = [];
     
        // Fetch the GeoJSON data again to access layers
        await fetch('static/sapoly.geojson')
        .then(response => response.json())
        .then(data => {
            L.geoJSON(data, {
                onEachFeature: (feature, layer) => {
                    let areasym = feature.properties.areasymbol;
                    if (this.selectedRegions.includes(areasym)) {
                        selectedLayers.push(layer);
                    }
                }
            });
    
            // Create a feature group with the selected layers
            let featureGroup = L.featureGroup(selectedLayers);
            // Add id for posterity
            featureGroup.options = {
                id:"sapoly"
                };

            // function that determines bounds, whether normal or adjusted for anti-meridian / pacific 
            const bounds = this.calculateZoomParameters(featureGroup);
            let zoomLevel = this.mapIt._map.getZoom(),
            featureCount = Object.keys(featureGroup._layers).length,
            calculatedZoom = this.mapIt._map.getBoundsZoom(bounds);

            if (featureCount != 1){
                calculatedZoom = Math.min(zoomLevel, this.mapIt._map.getBoundsZoom(bounds));
                switch (true) {
                    case zoomLevel <= 7:
                        calculatedZoom = Math.min(7, this.mapIt._map.getBoundsZoom(bounds));
                        break;
                    case zoomLevel > 7 && zoomLevel <= 9:
                        calculatedZoom = Math.min(9, this.mapIt._map.getBoundsZoom(bounds));
                        break;
                    case zoomLevel > 9 && zoomLevel <= 12:
                        calculatedZoom = Math.min(12, this.mapIt._map.getBoundsZoom(bounds));
                        break;
                    case zoomLevel > 12 && zoomLevel <= 16:
                        calculatedZoom = Math.min(16, this.mapIt._map.getBoundsZoom(bounds));
                        break;
                    case zoomLevel >= 17:
                        calculatedZoom = Math.min(17, this.mapIt._map.getBoundsZoom(bounds));
                        break;
                }
            }else if(featureCount == 1 && zoomLevel <= 5){
                calculatedZoom = Math.min(7, this.mapIt._map.getBoundsZoom(bounds));
            }
            else{
                calculatedZoom = zoomLevel;
            }
            //console.log("zooming from ", zoomLevel, " to ", calculatedZoom, "on" ,Object.keys(featureGroup._layers).length, "features")
            this.mapIt._map.setView(bounds.getCenter(), calculatedZoom);
        });
    }

    async getSSAByMap(areaSymbol, areaName) {
        DownloaderFunctions.srchSpinner.removeAttribute('style');
        //mapIt.closePopup();
        const areaStr = areaSymbol + ', ' + areaName;
        //need to cast to a list
        this.makeSSAList(areaStr.split());

        DownloaderFunctions.srchSpinner.setAttribute('style', 'display:none;');
    }

    async getSSAByState(stateAbbr, stateName) {

        DownloaderFunctions.srchSpinner.removeAttribute('style');

        //SAVEREST is a date in this format YYYY-MM-DD which I will need if I want to overwrite only with more recent data.
        const sqlQuery = `SELECT AREASYMBOL, AREANAME, CONVERT(varchar(10), [SAVEREST], 126) AS SAVEREST FROM SASTATUSMAP WHERE AREASYMBOL LIKE '${stateAbbr}%' ORDER BY AREASYMBOL`;
        try {
            const response = await fetch(this.SDA_POSTREST_URL, {
                method: 'POST',
                body: JSON.stringify({
                    'query': sqlQuery
                })    
            });

            if(response.ok) {
                let data = await response.text();
                const ssaInfo = DownloaderFunctions.parseXML(data);
                if(ssaInfo.length > 0) {
                    this.makeSSAList(ssaInfo);
                } else {
                    //TODO: Replace with USWDS compatiple alert. Search on "usa-alert usa-alert--warning"
                    alert(`No soil survey areas found for ${stateName}`);
                    throw new Error('No soil survey areas found for ' + stateName + ', ' + stateAbbr);
                }
            } else {
                fetch('/tlogger/warning:'+response.status);
                console.error('Error fetching data: ', response.status);
            }
        } catch (error) {
            const errStr = 'An error occurred: '+error;
            fetch('/tlogger/warning:'+errStr);
            console.error(errStr);
        }
        DownloaderFunctions.srchSpinner.setAttribute('style', 'display:none;');
    }

    getLocalSSAByKeyword(keystr) {
        if(!this.mapIt?.mapLayerSSA){
            return null;
        }

        const normalizedKey = String(keystr ?? '').toUpperCase();
        const conusExcludedPrefixes = ['MXNL', 'AK', 'HI', 'FM', 'GU', 'HT', 'MH', 'MP', 'PR', 'PW', 'VI'];
        const localRows = new Set();

        this.mapIt.mapLayerSSA.eachLayer((layer) => {
            const properties = layer?.feature?.properties ?? {};
            const areaSymbol = String(properties.areasymbol ?? '').toUpperCase();
            const areaName = String(properties.areaname ?? '').trim();

            if(!areaSymbol || areaSymbol === 'HT600'){
                return;
            }

            if(normalizedKey === 'CONUS' && conusExcludedPrefixes.some((prefix) => areaSymbol.startsWith(prefix))){
                return;
            }

            localRows.add(`${areaSymbol}, ${areaName}`);
        });

        return Array.from(localRows).sort((left, right) => left.localeCompare(right));
    }

    async getSSAByKeyword(keystr) {
        let where = '';                         //WHERE clause is not needed if user wants all areasymbols.
        keystr = keystr.replaceAll("'", "''").replaceAll('"', "''").replaceAll('*','%').trim()  //Perform basic sanatization and allows a user to use either % or * as a wildcard
        const isWildcardOnlySearch = keystr.length > 0 && keystr.replaceAll('%', '') === '';
        if(keystr.length === 0) {
            //TODO: Replace with USWDS compatiple alert. Search on "usa-alert usa-alert--warning"
            alert("Please enter a search term.")
            return
        }
        DownloaderFunctions.srchSpinner.removeAttribute('style');

        // Resolve broad searches from the locally loaded GeoJSON to avoid remote query failures.
        if(isWildcardOnlySearch || keystr.toUpperCase() === 'CONUS'){
            const localMatches = this.getLocalSSAByKeyword(keystr);
            if(Array.isArray(localMatches) && localMatches.length > 0){
                this.makeSSAList(localMatches);
                DownloaderFunctions.srchSpinner.setAttribute('style', 'display:none;');
                return;
            }
        }

        //If there is anything else in the keystr, any instance of CONUS/conus will be treated as an Invalid Search String
        //This does include something as innocuous as CONUS,
        //What I want to avoid is CA101, TX*, CONUS. 
        //CONUS, PR* is a legit example, but it doesn't seem worth making a complicated SQL statement for these edge cases.
        if(keystr.toUpperCase() == 'CONUS') {
            where = `AND AREASYMBOL NOT LIKE 'MXNL%'
                AND AREASYMBOL NOT LIKE 'AK%'
                AND AREASYMBOL NOT LIKE 'HI%'
                AND AREASYMBOL NOT LIKE 'FM%'
                AND AREASYMBOL NOT LIKE 'GU%'
                AND AREASYMBOL NOT LIKE 'HT%'
                AND AREASYMBOL NOT LIKE 'MH%'
                AND AREASYMBOL NOT LIKE 'MP%'
                AND AREASYMBOL NOT LIKE 'PR%'
                AND AREASYMBOL NOT LIKE 'PW%'
                AND AREASYMBOL NOT LIKE 'VI%'
            `;
        } else if (isWildcardOnlySearch);  //nothing to add to the SQL statement if user wants all areasymbols
        else {
            where = `AND (AREASYMBOL LIKE '%${keystr}%' OR AREANAME LIKE '%${keystr}%')`;
        }

        const sqlQuery = `SELECT AREASYMBOL, AREANAME, CONVERT(varchar(10), [SAVEREST], 126) AS SAVEREST FROM SASTATUSMAP WHERE AREASYMBOL != 'HT600' ${where} ORDER BY AREASYMBOL`;

        //scenarios:
        // 1. User entered ONLY * or % to get all areasymbols - where clause not needed
        // 2. User entered ONLY CONUS/conus - where clause contains series of NOT LIKE clauses to exclude non-conus areasymbols
        // 3. User entered a string that is queried against the database using LIKE
        try {
            const response = await fetch(this.SDA_POSTREST_URL, {
                method: 'POST',
                //format: 'JSON',
                body: JSON.stringify({
                    'query': sqlQuery
                })    
            });

            if(response.ok) {
                const data = await response.text();
                const ssaInfo = DownloaderFunctions.parseXML(data);
                if(ssaInfo.length > 0) {
                    this.makeSSAList(ssaInfo)
                } else {
                    //This doesn't work. If a polygon is drawn outside of all soil survey areas, the response.ok = False
                    //TODO: Replace with USWDS compatiple alert. Search on "usa-alert usa-alert--warning"
                    alert(`No soil survey areas found for ${keystr}`);
                    throw new Error('No soil survey areas found for ' + keystr);
                }
            } else {
                let responseDetails = '';
                try {
                    responseDetails = await response.text();
                } catch (_) {
                    responseDetails = '';
                }

                const errorMessage = `Error fetching data (${response.status}${response.statusText ? ` ${response.statusText}` : ''}).`;
                console.error(errorMessage, responseDetails);
                fetch('/tlogger/warning:' + encodeURIComponent(`${errorMessage} ${responseDetails.slice(0, 240)}`));
                alert(errorMessage);
            }
        } catch (error) {
            console.error('An error occurred: ', error);
        }
        DownloaderFunctions.srchSpinner.setAttribute('style', 'display:none;');
    }

    async getSSAIntersect(wktSQL, multipolygon = false) {
        DownloaderFunctions.srchSpinner.removeAttribute('style');

        // https://sdmdataaccess.nrcs.usda.gov/WebServiceHelp.aspx#PostRestQueryService
        // https://sdmdataaccess.nrcs.usda.gov/Query.aspx 
        // example construction: "SELECT * FROM SDA_Get_Areasymbol_from_intersection_with_WktWgs84('Polygon((-101.943034 38.486870, -101.943034 40.017670, -99.074582 40.017670, -99.074582 38.486870, -101.943034 38.486870))')"
        // const sqlPolygonIntersectSSA = `SELECT * FROM SDA_Get_Areasymbol_from_intersection_with_WktWgs84('${wktGeometry}')`;
        // example rest endpoint: https://SDMDataAccess-test.cert.sc.egov.usda.gov/Tabular/post.rest

        try {
            const areaSymbolGroups = await Promise.all(
                wktSQL.map(async (sqlCommand) => {
                    const response = await fetch(this.SDA_POSTREST_URL, {
                        method: 'POST',
                        body: JSON.stringify({
                            'query': sqlCommand
                        })
                    });

                    if(!response.ok){
                        const responseDetails = await response.text().catch(() => '');
                        throw new Error(
                            `Intersection query failed (${response.status}${response.statusText ? ` ${response.statusText}` : ''}). ${responseDetails.slice(0, 240)}`
                        );
                    }

                    const xmlText = await response.text();
                    const parser = new DOMParser();
                    const xmlDoc = parser.parseFromString(xmlText, 'text/xml');
                    const tables = xmlDoc.getElementsByTagName('Table');

                    return Array.from(tables)
                        .map((table) => table.getElementsByTagName('areasymbol')[0]?.textContent?.trim()?.toUpperCase())
                        .filter(Boolean);
                })
            );

            let areasymbols = [...new Set([].concat.apply([], areaSymbolGroups))];

            // If a user's AOI contains multiple polygons that produce common matches, keep only new areas.
            if (multipolygon) {
                areasymbols = areasymbols.filter(itm => !this.aoiRegions.includes(itm));
                for (let area of areasymbols) {
                    if (!this.selectedRegions.includes(area) && !this.aoiRegions.includes(area)) {
                        this.aoiRegions.push(area);
                    }
                }
            }

            if(areasymbols.length === 0){
                alert('Drawn polygon does not intersect with any Soil Survey Areas.');
                return;
            }

            const sqlGetAreaData = `
            SELECT AREASYMBOL,
                    AREANAME,
                    CONVERT(varchar(10),
                    [SAVEREST], 126) AS SAVEREST
                    FROM SASTATUSMAP
                    WHERE AREASYMBOL IN (${areasymbols.map(symbol => `'${symbol}'`).join(', ')})
                    ORDER BY AREASYMBOL`;

            const detailResponse = await fetch(this.SDA_POSTREST_URL, {
                method: 'POST',
                body: JSON.stringify({
                    'query': sqlGetAreaData
                })
            });

            if(!detailResponse.ok){
                const responseDetails = await detailResponse.text().catch(() => '');
                throw new Error(
                    `Intersection detail query failed (${detailResponse.status}${detailResponse.statusText ? ` ${detailResponse.statusText}` : ''}). ${responseDetails.slice(0, 240)}`
                );
            }

            const data = await detailResponse.text();
            const ssaInfo = DownloaderFunctions.parseXML(data);
            if (ssaInfo.length > 0) {
                this.makeSSAList(ssaInfo);
            } else {
                alert('Drawn polygon does not intersect with any Soil Survey Areas.');
            }
        } catch(error) {
            DownloaderFunctions.tloggerWarning(error);
            alert('Unable to fetch Soil Survey Areas for the drawn polygon. Please try again.');
        } finally {
            DownloaderFunctions.srchSpinner.setAttribute('style', 'display:none;');
        }

    }
    static tloggerWarning(error){
        const errStr = 'An error occurred: ' + error;
        fetch('/tlogger/warning:' + encodeURIComponent(errStr));
        console.error('Generic error: ', error)
    }

    static handleStopDownload(e){
        DownloaderFunctions.worker.postMessage({command: 'stop-download'});
        document.getElementById('downloadBtn').disabled = false;
    }

    async downloadCandidates(){

        this.successAreas = [];
        this.failedAreas = [];

        const progressDisplayComp = document.getElementById("progressdisplay");
        const rawFolderPath = document.getElementById('downloadTextBox').value
        const overwriteflg = document.getElementById('downloadOverwriteFlg').checked;
        const areaSymbols = document.getElementById('ssaselector').getAreaSymbols();

        if(!Array.isArray(areaSymbols) || areaSymbols.length === 0){
            alert('No survey areas were selected.')
            document.getElementById('downloadBtn').disabled = false;
            return
        }

        const resolvedDestination = await this.resolveDownloadDestination(rawFolderPath)
        if(!resolvedDestination.success){
            alert(resolvedDestination.message)
            document.getElementById('downloadBtn').disabled = false;
            return
        }

        const folderPath = resolvedDestination.path

        const preflightResult = await this.runDownloadPreflight(
            folderPath,
            areaSymbols.length,
        )
        if(!preflightResult.success){
            alert(preflightResult.message)
            document.getElementById('downloadBtn').disabled = false;
            return
        }

        if(DownloaderFunctions.normalizeDownloadPath(rawFolderPath) !== folderPath){
            fetch('/tlogger/info:' + encodeURIComponent(
                `Download destination auto-resolved to ${folderPath} (${resolvedDestination.source}).`
            ))
        }

        if(preflightResult.message){
            fetch('/tlogger/info:' + encodeURIComponent(preflightResult.message))
        }

        document.getElementById('downloadTextBox').value = folderPath

        //disable download button while downloading files
        document.getElementById('downloadBtn').disabled = true;
        BrowserStorage.setLocalStorage("downloadpath", folderPath)
        
        progressDisplayComp.removeEventListener("onStopAction", DownloaderFunctions.handleStopDownload);
        progressDisplayComp.addEventListener("onStopAction", DownloaderFunctions.handleStopDownload);

        progressDisplayComp.progressTitle = "Downloading data...";
        progressDisplayComp.progressCounterMessage = `0 out of ${areaSymbols.length} Survey Areas downloaded`;
        progressDisplayComp.progressScreenSetup(areaSymbols, 'download');    

        DownloaderFunctions.worker.postMessage({command: 'download', destination: folderPath, overwrite: overwriteflg, areaSymbols: areaSymbols});
        //Clear any active listeners
        $("#downloadToImportTable").off()
        $("#downloadToImportTable").on("click", () => {ImportActivities.downloadToImportTable(folderPath)})
    }

    // Function to calculate bounds based on a feature group
    calculateZoomParameters(featureGroup) {

        let northEast = featureGroup.getBounds()._northEast;
        let southWest = featureGroup.getBounds()._southWest;
        let longitudes = [];
        let corner1
        let corner2
        // Check if longitudes cross the International Date Line (IDW/180 degrees)
        const crossesDateLine = northEast.lng >= 0 || southWest.lng >= 0;

        // this logic needs improvement + possible combination w/ selection over IDW logic
        if (crossesDateLine){
            featureGroup.eachLayer((layer) => {
                const bounds = layer.getBounds();
                longitudes.push(bounds.getNorthEast().lng); // Add north-east longitude
                longitudes.push(bounds.getSouthWest().lng); // Add south-west longitude
                // console.log(layer.getBounds()); // Logs each layer in the FeatureGroup
            });
            //split longitudes into negative and positive values
            const { negativeValues, positiveValues } = longitudes.reduce(
                (result, value) => {
                    if (value < 0) {
                        result.negativeValues.push(value);
                    } else {
                        result.positiveValues.push(value);
                    }
                    return result;
                },
                { negativeValues: [], positiveValues: [] }
            );

            // black magic for readjusting the longitudinal bounds crossing the IDW/180d. 
            // leaflet can't handle this in any reasonable fashion.
            const maxNegativeValue = negativeValues.length > 0 ? Math.max(...negativeValues) : (Math.min(...positiveValues)-360);
            // top right northeast
            corner1 = new L.latLng(northEast.lat, maxNegativeValue, true);
            // bottom left southwest
            corner2 = new L.latLng(southWest.lat, (Math.min(...positiveValues)-360), true);
        }else{
            corner1 = new L.latLng(northEast.lat, northEast.lng, true);
            corner2 = new L.latLng(southWest.lat, southWest.lng, true);
        }

        return L.latLngBounds(corner1, corner2);
    }
    
    async initializeMap(){
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19,
            attribution: '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>'}).addTo(this.mapIt._map);

        await fetch('static/StateAndIslandBoundaries_wgs84.geojson')
        .then(response => response.json())
        .then(geojsonStates => {
            this.mapIt.stateLayer = ""
            this.mapIt.stateLayer = L.geoJSON(geojsonStates, {
                style: () =>{
                    return {
                        // weight looks ok unless there is a messy coastline
                        weight: this.mapIt.calculateBorderWeight() * 3,
                        fillOpacity: 0,
                        color: 'darkblue'
                    };
                }
            })
            this.mapIt._map.addLayer(this.mapIt.stateLayer)
            this.mapIt.stateLayer.bringToBack()
        })
        .catch(error => {
            const errStr = 'Error loading GeoJSON: ' + error;
            fetch('/tlogger/warning:'+errStr);
            console.error(errStr);
        });

        await fetch('/static/sapoly.geojson')
        .then(response => response.json())
        .then(geojsonSSA => {
            // Adjust the coordinates of features in the South Pacific
            geojsonSSA.features.forEach(feature => {
                if (feature.geometry.type === 'Polygon' || feature.geometry.type === 'MultiPolygon') {
                    feature.geometry.coordinates = feature.geometry.coordinates.map(polygon => {
                        return polygon.map(ring => {
                            return ring.map(coord => {
                                if (coord[0] > 0) { // Assuming positive longitudes need adjustment
                                    coord[0] -= 360;
                                }
                                return coord;
                            });
                        });
                    });
                }
            });

        // geojson layer for SSA
        this.mapIt.mapLayerSSA = L.geoJSON(geojsonSSA, {
            style: () => {
                return {
                weight: this.mapIt.calculateBorderWeight('initialize ssa', 0.5),
                fillOpacity: 0,
                color: 'darkgray'
                }
            },
            onEachFeature: (feature, layer) => {
                layer.on('mouseover', this.importPolygonHoverController);
                layer.on('mouseout', () => {
                    DownloaderFunctions.mapTip.style.display = 'none';
                    if (!this.selectedRegions.includes(feature.properties.areasymbol)) {
                        layer.setStyle({ 
                            weight: this.mapIt.calculateBorderWeight('mouseout ssa', 1), 
                            color: 'darkgray', 
                            fillOpacity: 0 
                        });
                    }
                });
                layer.on('click', (e) => {

                        if (feature.properties.areasymbol){

                            const areaSym = feature.properties.areasymbol;
                            const areaName = feature.properties.areaname;

                                if(!this.selectedRegions.includes(areaSym)) {
                                    this.getSSAByMap(areaSym, areaName);
                                    this.importPolygonHoverController(e);
                                } else {
                                    DownloaderFunctions.removeAreasymbolByMap(areaSym);
                                    this.importPolygonHoverController(e);
                                }
                            
                        }
                    });
                
                }
            });
            this.mapIt._map.addLayer(this.mapIt.mapLayerSSA)
            this.mapIt.mapLayerSSA.bringToFront();
        })
        // sapoly.geojson not loading catch location is here.  Unclear as to why this is randomly failing.
        .catch(error => console.error('Error loading WFS data:', error)); // need to confirm this error handling on map load


        this.mapLayerDrawn = new L.FeatureGroup();
        // add id for posterity
        this.mapLayerDrawn.options = {
            id:"mapLayerDrawn"
          };
        this.mapIt._map.addLayer(this.mapLayerDrawn);
        let drawControl = new L.Control.Draw({
            draw: {
                //To make the interface straightforward, the group decided to enable only the rectangle and polygon tools
                polyline: false,
                marker: false,
                circlemarker: false,
                polygon: true,
                rectangle: true,
                circle: false
            },
            edit: {
                featureGroup: this.mapLayerDrawn,
                //To make the interface straightforward, the group decided to exclude polygon Edit and Delete tools
                edit: false,
                remove: false
            }
        });
        this.mapIt._map.addControl(drawControl);

        // Extends leaflet to contain a new button that deletes all drawn or imported selection layers
        L.Control.Button = L.Control.extend({
            options: {
                position: 'topleft'
            },
            onAdd: (mapIt) => {
                let container = L.DomUtil.create('div', 'leaflet-bar leaflet-control ');
                let button = L.DomUtil.create('a', 'leaflet-control-button', container);
                button.innerHTML = '<img class="leaflet-custom-remove" src="/static/images/delete_outline.svg">';
                L.DomEvent.disableClickPropagation(button);
                L.DomEvent.on(button, 'click', ()=>{
                    if(this.mapLayerDrawn.toGeoJSON().features.length > 0){
                        this.mapLayerDrawn.eachLayer((layer) => {
                            this.mapLayerDrawn.removeLayer(layer);
                        })
                    }
                    if (typeof this.mapIt.shapefileFeatureGroup !== 'undefined') {
                        this.mapIt.shapefileFeatureGroup.eachLayer((layer) => {
                            this.mapIt.shapefileFeatureGroup.removeLayer(layer);
                        })
                      }
                });
        
                container.title = "Remove all selection layers";
        
                return container;
            },
            onRemove: function(mapIt) {},
        });
        let customRemoveControl = new L.Control.Button()
        customRemoveControl.addTo(this.mapIt._map);

        this.mapIt._map.on('draw:created', (event) => {
            let layer = event.layer;
            // check if input is valid (i.e. remove bowties)
            let validationObj = this.validateDrawnInput(layer);
            //check if drawn poly intersects with any of the
            //SSAs. The resulting intersect will be null if false.
            if (validationObj.isIntersectingStates != null && validationObj.isValid){

                let mapConstructorPoly = DownloaderFunctions.constructSDAPolygonRequests(layer, validationObj.isBreaching);
                this.getSSAIntersect(mapConstructorPoly.wkts, false);
                // does it intersect with IDL.  Currently we disable polygons that intersect.
                // There is a bug with how the polygon is drawn/re-bounded on the map after a zoom
                if(!validationObj.isBreaching){
                    this.mapLayerDrawn.addLayer(layer);
                }else{
                    this.mapLayerDrawn.addLayer(new L.geoJSON(mapConstructorPoly.poly), true)
                }
                this.mapLayerDrawn.bringToBack();
            }else{
                // SSA layers do not intersect
                alert("Drawn polygon does not intersect with any Soil Survey Areas.");
            }
        });

        this.mapIt._map.on('draw:drawstart', () => {
            this.isDrawing = true;
            DownloaderFunctions.mapTip.style.display = 'none';
        });
        this.mapIt._map.on('draw:drawstop', () => {
            this.isDrawing = false;
            DownloaderFunctions.mapTip.style.display = 'block';
        });    

    };
    // reorganize defined coordinates to assert proper WKT vertex sequence for SDA query
    // arguably this is not needed with some improved math elsewhere
    static sortClockwise(coordinatesArray) {
        let sumX = 0;
        let sumY = 0;
        for (const coord of coordinatesArray) {
            sumX += coord[0];
            sumY += coord[1];
        }
        const center = {x: sumX / coordinatesArray.length, y: sumY / coordinatesArray.length};
        coordinatesArray.sort((a, b) => {
            const angleA = Math.atan2(a[1] - center.y, a[0] - center.x);
            const angleB = Math.atan2(b[1] - center.y, b[0] - center.x);
            return angleA - angleB;
        });
        return coordinatesArray;
    }

    static constructSDAPolygonRequests(i, breachesIDL){

        // Check if longitudes cross the International Date Line (IDW/180 degrees)
        if (breachesIDL){
            // function accumulates vertices divided between the IDL
            const { easternHemisphere, westernHemisphere, vertexExperiment} = i.getLatLngs()[0]
                .reduce((result, value) => {
                    if (value.lng < -180) {
                        // tmp array is accumulated for IDL vertex testing for both west and east requests
                        // this maintains multiple CRS situations needed
                        result.vertexExperiment.push([value.lng, value.lat]);
                        result.easternHemisphere.push([value.lng += 360, value.lat]);
                    } else {
                        result.westernHemisphere.push([value.lng, value.lat]);
                    }
                    return result;
                },{ easternHemisphere: [], westernHemisphere:[], vertexExperiment:[]});

            const breachingPolygons = [DownloaderFunctions.sortClockwise([vertexExperiment,westernHemisphere].flat(1))][0];
            breachingPolygons.push(breachingPolygons[0]); //push copy of first coordinate to close the polygon loop

            // handle the western hemisphere first, differently, as IDL vertex intersections are mostly equivalent
            // in both east/west hemispheres
            // This is the realm of -180 +/- longitude values
            const [intersectionsWest, intersectionsEast] = [turf.lineIntersect(
                    turf.lineString([
                        [-180, 90],
                        [-180, -90]
                    ]),
                    turf.polygon([breachingPolygons])
                ).features.map(a => a.geometry)
                .map(b => b.coordinates),
                // This is the realm of 180 +/- longitude values
                turf.lineIntersect(
                    turf.lineString([
                        [-180, 90],
                        [-180, -90]
                    ]),
                    turf.polygon([breachingPolygons]))
                .features.map(a => a.geometry)
                .map(b => {
                    return [180, b.coordinates[1]]
            })];
            
            //deep copy on IDL intersections.  I can't seem to move this anywhere else - immutability is seemingly broken here.  
            // let intersectionsEast = Object.assign({}, intersectionsWest); // deep copy
            const westCoordsNew = DownloaderFunctions.sortClockwise([westernHemisphere,intersectionsWest].flat(1)); 
            westCoordsNew.push(westCoordsNew[0]);
            const polyWestern = turf.polygon([westCoordsNew]);
            const wHemisphereWKT = Terraformer.geojsonToWKT(polyWestern.geometry);
            const sqlWestern = `SELECT * FROM SDA_Get_Areasymbol_from_intersection_with_WktWgs84('${wHemisphereWKT}')`;

            ////////
            // handle the eastern hemisphere using above/found IDL vertex intersections
            // This is the realm of 180 +/- longitude values
            const eastCoordsNew = DownloaderFunctions.sortClockwise([easternHemisphere,intersectionsEast].flat(1));
            eastCoordsNew.push(eastCoordsNew[0]); //push copy of first coordinate to close the polygon loop
            const polyEastern = turf.polygon([eastCoordsNew]); 
            const eHemisphereWKT = Terraformer.geojsonToWKT(polyEastern.geometry);
            const sqlEastern = `SELECT * FROM SDA_Get_Areasymbol_from_intersection_with_WktWgs84('${eHemisphereWKT}')`;
            const polyBreach = turf.polygon([breachingPolygons]); 

            return {
                wkts : [sqlEastern,sqlWestern],
                poly: polyBreach
            };


        }else{ // this is legacy for non IDL requests
            // this works on standard queries - so I will keep it for the interim
            let wkt = 'Polygon((';
            let latLngs = i.getLatLngs()[0];

            latLngs.push(latLngs[0]);
            latLngs.forEach((latlng, index) => {
                //This modification is needed so that the Pacific Ocean immediately to the left (west) of Hawaii generates coordinates that
                //the intersection web service expects (otherwise, the searchable area was the Pacific Ocean in the far east of the map.)
                let lngMod = latlng.lng;
                if (lngMod < -180) {
                    lngMod += 360;
                };
                wkt += lngMod.toFixed(6) + ' ' + latlng.lat.toFixed(6);
                if (index !== latLngs.length - 1) {
                    wkt += ', ';
                };
            });
            wkt += '))';
            let sqlNoBreach = `SELECT * FROM SDA_Get_Areasymbol_from_intersection_with_WktWgs84('${wkt}')`;
            return {
                wkts: [sqlNoBreach]
            };
        }
    };
    
    // helper function for current and future input validation
    validateDrawnInput(layer){
        // checks IDL funny business, bowtie shapes, predicts empty SSA results
        let isBreaching = turf.booleanIntersects(layer.toGeoJSON(), turf.lineString([[-180, 90],[-180, -90]])),
            isValid = (turf.kinks(layer.toGeoJSON()).features.length === 0),
            isIntersectingStates = turf.intersect(turf.featureCollection([layer.toGeoJSON(),turf.union(this.mapIt.stateLayer.toGeoJSON())]));
        return {
            isBreaching : isBreaching,
            isValid : isValid,
            isIntersectingStates : isIntersectingStates
        }
    }


    // function to consolidate hover functionality on imported selection data
    importPolygonHoverController(e){

        if(!this.isDrawing) {
            
            // Iterate through all layers in the map to ensure that highlighted layers stay on top
            // added due to calculateBorderWeight() upgrades
            // consider sharing logic with highlight / unhighlight functions
            if(this.selectedRegions.length > 0){
                for (const key of Object.keys(this.mapLayerDrawn._map._layers)) {
                    const layer = this.mapLayerDrawn._map._layers[key];
        
                    // Check if the layer has the required structure and properties for SSA feature
                    const areaSymbol = layer?.feature?.properties?.areasymbol;
        
                    // If the layer's areasymbol exists and is in the DownloaderFunctions.selectedRegions array, bring it to the front
                    if (areaSymbol && this.selectedRegions.includes(areaSymbol)) {
                        layer.bringToFront();
                    }
                }
            }

            DownloaderFunctions.mapTip.style.display = 'block';

            if (e?.target?.feature?.properties?.areasymbol) {
                const areaSym = e.target.feature.properties.areasymbol;
                const areaName = e.target.feature.properties.areaname;
                let tooltipcontent
                if (!this.selectedRegions.includes(areaSym)) {
                    e.target.setStyle({
                        weight: this.mapIt.calculateBorderWeight('mouseover ssa', 2), 
                        color: 'black', 
                        fillOpacity: 0
                    });
                    e.target.bringToFront();
                    // consider some tomato and seagreen?
                    // if(addPolyText){
                        // var tooltipcontent = '<b>Click</b> to <b style="color:MediumSeaGreen;">ADD</b>: ' + areaSym + ', ' + areaName +
                        // '<br><b>Long Click</b> to <b style="color:Tomato;">REMOVE</b> drawn polygon.';
                    // }else{
                        tooltipcontent = 'Click to <b>ADD</b>: ' + areaSym + ', ' + areaName;
                    } else {
                        tooltipcontent = 'Click to <b>REMOVE</b>: ' + areaSym + ', ' + areaName;
    
                }
                DownloaderFunctions.mapTip.innerHTML = tooltipcontent;
            }
        }
    }

    // function to handle common mouseover logic as it interacts with featureGroup polygons
    mouseOverPointInPolygon(featureGroup, e){
        if(Object.keys(featureGroup._map._layers).length !== 0){
            featureGroup.eachLayer((layer) => {
                // turf requires geojson inputs
                let pointCoordinateGeoJson = L.marker([e.latlng.lat, e.latlng.lng]).toGeoJSON(),
                    polyForIntersectGeoJson = layer.toGeoJSON();
                // this currently pertains to shapefile / geojson imports (need to test geojson)
                if(layer.toGeoJSON().type === 'FeatureCollection'){
                    polyForIntersectGeoJson = polyForIntersectGeoJson.features[0];
                }
                // test if point intersects
                let isInsideDrawn = turf.booleanPointInPolygon(pointCoordinateGeoJson, polyForIntersectGeoJson);
                if(isInsideDrawn){
                    layer.setStyle({
                        weight: this.mapIt.calculateBorderWeight('mouseover in', 3)
                    });
                }else{
                    layer.setStyle({
                        weight: this.mapIt.calculateBorderWeight('mouseover out', 1)
                    });
                }
            })
        }
    }

    // Get references to the buttons and input elements

    // Function to toggle visibility
    static toggleVisibility(element) {
        DownloaderFunctions.a1.style.display = 'none';
        DownloaderFunctions.a2.style.display = 'none';
        DownloaderFunctions.a3.style.display = 'none';
        element.style.display = 'table';

        DownloaderFunctions.stateButton.setAttribute('aria-expanded', element === DownloaderFunctions.a1 ? 'true' : 'false');
        DownloaderFunctions.keywordButton.setAttribute('aria-expanded', element === DownloaderFunctions.a2 ? 'true' : 'false');
        if(DownloaderFunctions.enableShapefileDownload){DownloaderFunctions.shapefileButton.setAttribute('aria-expanded', element === DownloaderFunctions.a3 ? 'true' : 'false')}
    }

    setDownloaderEventListeners(){
        // Event listeners for buttons
        DownloaderFunctions.stateButton.addEventListener('click', () => DownloaderFunctions.toggleVisibility(DownloaderFunctions.a1));
        DownloaderFunctions.keywordButton.addEventListener('click', () => DownloaderFunctions.toggleVisibility(DownloaderFunctions.a2));
        if(DownloaderFunctions.enableShapefileDownload){DownloaderFunctions.shapefileButton.addEventListener('click', () => DownloaderFunctions.toggleVisibility(DownloaderFunctions.a3))}
        
        //Read user's Shapefile/.geojson
        document.getElementById('file-input-specific').addEventListener('change', (e) =>{this.getSSAByFile(e)});
    }


    processGeoJson(userJson) {
        // Wrap the userJson in a FeatureCollection
        const geoJsonFeature = {
            type: "Feature",
            geometry: userJson,
            properties: {}
        };
        const geoJsonFeatureCollection = {
            type: "FeatureCollection",
            features: [geoJsonFeature]
        };

        // Add GeoJSON to Leaflet map
        // shapefile layer
        let mapLayerShapefile = L.geoJSON(geoJsonFeatureCollection, {
            style: () => {
                return {
                    fillOpacity: 0,
                    color: 'red',
                    weight: this.mapIt.calculateBorderWeight('add shapefile', 1)
                };
            }
        });

        this.mapIt.shapefileFeatureGroup.addLayer(mapLayerShapefile);

        // Convert GeoJSON to WKT using geojsonToWKT()
        try {
            if (userJson.type === 'Polygon' || userJson.type === 'MultiPolygon') {
                //https://github.com/terraformer-js/terraformer/tree/main/packages/wkt
                let isBreaching = turf.booleanIntersects(userJson, turf.lineString([[-180, 90],[-180, -90]]))
                let mapConstructorPoly = DownloaderFunctions.constructSDAPolygonRequests(Object.values(mapLayerShapefile._layers)[0], isBreaching)
                this.getSSAIntersect(mapConstructorPoly.wkts, true);
            } else {
                const warnStr = 'Unsupported geometry type: ' + userJson.type;
                fetch('/tlogger/warning:'+warnStr);
                console.warn(warnStr);
            }
        } catch (error) {
            const errStr = 'GeoJSON processing error: ' + error;
            console.error(errStr);
            fetch('/tlogger/warning:'+errStr);
        }
    }
    log(result){
        if (result.done) return;
        this.processGeoJson(result.value.geometry);
        return source.read().then(this.log);
    }

    getSSAByFile(event) {
        this.aoiRegions = [];
        const file = event.target.files[0];
        if (file) {
            DownloaderFunctions.srchSpinner.removeAttribute('style');
            const reader = new FileReader();
            reader.onload = (e) => { this.processUserFile(e, file)};
            if (file.name.endsWith('.shp')) {
                reader.readAsArrayBuffer(file);
            } else {
                reader.readAsText(file);
            }
            DownloaderFunctions.srchSpinner.setAttribute('style', 'display:none;');
        }
    }

    async processUserFile(e, file){
        try {
            // Check if the file is a shapefile
            if (file.name.endsWith('.shp')) {
                try{
                    //https://www.npmjs.com/package/@rubenrodriguez/shapefile
                    let source = await shapefile.open(e.target.result)
                    let result = await source.read()
                    if (result?.done) return
                    this.processGeoJson(result?.value?.geometry)
                    return this.log(result)
                }
                catch(error){
                    const errStr = 'Error reading user file: ' + error;
                    fetch('/tlogger/warning: '+errStr);
                    console.error(errStr);
                }
            } else if (file.name.endsWith('.geojson')) {
                // If not a shapefile, assume it's already GeoJSON
                const userJson = JSON.parse(e.target.result);
                for (const feature of userJson.features) {
                    if (feature.geometry.type === 'Polygon' || feature.geometry.type === 'MultiPolygon') {
                        this.processGeoJson(feature.geometry);
                    }
                }
            }
        } catch (error) {
            const errStr = 'Error reading user file: ' + error;
            fetch('/tlogger/warning: '+errStr);
            console.error(errStr);
            return;
        }
    }
}