import {LitElement, html, classMap, styleMap, unsafeHTML, repeat} from './lit-all.min.mjs';
export class ProgressDisplayElement extends LitElement {
    static properties = {
        progressTitle:{type: String},        
        progressCounterMessage: {type: String},
        progressText: {type: String},
        successValue: {type: Number},
        valueMax: {type: Number}, 
        failValue: {type: Number},      
        progressListButtonText: {type: String},    
    
        _timerDisplay: {type: String},        
        _successClasses: {type: Object},  
        _failClasses: {type: Object},
        _hideStopButton: {type: Boolean},
        _hideProgressListButton: {type: Boolean},
        _hideProgressErrorButton: {type: Boolean},
        _hideCloseProgressModal: {type: Boolean},
        _successMessages: {type: Array},
        _failMessages: {type: Array},
        _hideDialog: {type: Boolean},
        _errorListButtonText: {type: String},

        _action: {type: String}
    }

    get _successWidth(){
        let width = ((this.successValue * 100) / this.valueMax);
        return width == 0 ? 1 : width;
    }

    get _failWidth(){
        return ((this.failValue * 100) / this.valueMax);
    }

    constructor() {
        super();
        this.progressTitle = '';
        this.progressListButtonText = '';
        this.progressCounterMessage = '';
        this.progressText = '';     
        this._timerDisplay = '';
        this.successValue = 0;
        this.valueMax = 100;                
 
        this.failValue = 0;

        this._successClasses = {
            "progress-bar":true, 
            "progress-bar-striped":true, 
            "progress-bar-animated":true, 
            "bg-danger": false, 
            "bg-success": false, 
            "bg-info": false
        }

        this._failClasses = {
            "progress-bar":true, 
            "progress-bar-striped":true, 
            "progress-bar-animated":true, 
            "bg-danger": true, 
            "bg-success": false, 
            "bg-info": false
        }

        this._hideStopButton = false;
        this._hideProgressListButton = false;
        this._hideProgressErrorButton = false;
        this._hideCloseProgressModal = false;
        this._successMessages = [];
        this._failMessages = [];
        this._hideDialog = true;
        this._errorListButtonText = '';
        this._action = "";
    }
    
    render() {

        return html`
            <!--End Warning/Error Modals-->
            <!--Loading Page modal from Home Page-->
            <div class="modal fade" id="progressScreen2" tabindex="-1" role="dialog" aria-modal="true" aria-label="Loading screen">
                <div class="modal-dialog" role="document" style="height:inherit;">
                    <div class="modal-content" style="height: fit-content; min-height: 100vh;">
                        <div class="modal-body" id='progressScreenModal2' populated='False' aria-live="polite">
                            <div id="progressScreenContainer2" class="progressScreen">
                                <!--Toggled by ssurgo_portal_scripts.js-->
                                <span id="progressTitle2">${this.progressTitle}</span> <!-- Consider wrapping this inside a <h#> tag. Currently doesn't stand out -->
                                <img 
                                    src="/static/images/fileIcon.svg" 
                                    id="progressImgDownload2" 
                                    alt="progressImageDownload" 
                                    style="display: ${this._action === 'download' ? 'initial;' : 'none;'}" 
                                >
                                <img 
                                    src="/static/images/SSAsInDatabaseIcon.svg" 
                                    id="progressImgImport2" 
                                    alt="progressImageImport" 
                                    style="display: ${this._action === 'import' ? 'initial;' : 'none;'}" 
                                >
                                <img 
                                    src="/static/images/DeleteSSAsFromDatabaseIcon.svg" 
                                    id="progressImgDelete2" 
                                    alt="progressImageDelete"
                                    style="display: ${this._action === 'delete' ? 'initial;' : 'none;'}" 
                                > <!--Populated by ssurgo_portal_scripts.js-->
                                <p id="progressText2" style="text-align: center;">${unsafeHTML(this.progressText)}</p> <!--Populated by ssurgo_portal_scripts.js-->
                                <!--Values are changed by ssurgo_portal_scripts.js-->                        
                                <div class="timer" role="timer">
                                    <p>Elapsed Time:</p>
                                    <div id="timerCount2">${this._timerDisplay}</div>
                                </div>
                                <div id='progressBarSuccessContainerId' class='progress progressBarSuccessContainer'>
                                    <div id="progressBarSuccess2"
                                        class=${classMap(this._successClasses)} 
                                        role="progressbar" 
                                        aria-label="successful progress"
                                        style="width: ${this._successWidth}%" 
                                        aria-valuenow="${this.successValue}" 
                                        aria-valuemin="0" 
                                        aria-valuemax="${this.valueMax}">
                                    </div>
                                    <div id="progressBarFail2" 
                                        class=${classMap(this._failClasses)}
                                        role="progressbar"
                                        aria-label="failed progress"
                                        style="width: ${this._failWidth}%" 
                                        aria-valuenow="${this.failValue}" 
                                        aria-valuemin="0" 
                                        aria-valuemax="${this.valueMax}">
                                    </div>
                                </div>
                                
                                <div id='loadingSpinnerContainerId' class="spinner-border text-primary" style="display: none; width: 6rem; height: 6rem; padding: 5px;"></div>
                                <img id="doneLoadingImgId" src="/static/images/checkmarkFilled.svg" style="display: none; width: 6rem; height: 6rem; padding: 5px;" alt="done raster generation" class="filter-green"/>
                                <img id="failedLoadingImgId" src="/static/images/failedIcon.svg" style="display: none; width: 6rem; height: 6rem; padding: 5px;" alt="failed raster generation"/>

                                <p id="progressCounterMessage2">${unsafeHTML(this.progressCounterMessage)}</p><!--Populated by ssurgo_portal_scripts.js-->
                                <div class="usa-accordion">
                                    <button
                                        type="button"
                                        id="toggleProgressErrorDiv" 
                                        class="usa-accordion__button"
                                        aria-expanded="false"
                                        aria-controls="progressErrorDiv2" 
                                        style=${styleMap({display: this._hideProgressErrorButton ? 'none' : 'initial'})}
                                    >
                                        <div class="usa-alert usa-alert--error usa-alert--slim">
                                            <div class="usa-alert__body">
                                                    <p class="usa-alert__text">${this._errorListButtonText}</p>
                                            </div>
                                        </div>                                        
                                        <!--Button text is populated by ssurgo_portal_scripts.js-->
                                    </button>
                                    <div id="progressErrorDiv2" class="margin-left-1" hidden>
                                        ${repeat(
                                            this._failMessages,
                                            msg => msg,
                                            (msg, index) =>
                                                html`
                                                    <div class="usa-alert usa-alert--error usa-alert--slim">
                                                        <div class="usa-alert__body">
                                                            <p class="usa-alert__text">${unsafeHTML(msg)}</p>
                                                        </div>
                                                    </div>                                                
                                                `
                                            )}                                        
                                    </div>
                                </div>
                                <div class="usa-accordion">
                                    <button
                                        type="button"
                                        id="progressListButton" 
                                        class="usa-accordion__button"
                                        aria-expanded="false"
                                        aria-controls="progressList2" 
                                        style=${styleMap({display: this._hideProgressListButton ? 'none' : 'initial'})}
                                    >
                                        <div class="usa-alert usa-alert--success usa-alert--slim">
                                            <div class="usa-alert__body">
                                            <p id="progressListButtonText2" class="usa-alert__text">${this.progressListButtonText}</p> <!--Populated by ssurgo_portal_scripts.js-->
                                            </div>
                                        </div>
                                        <!--Populated by ssurgo_portal_scripts.js-->
                                    </button>                        
                                    <div id="progressList2" class="margin-left-1" hidden>
                                        ${repeat(
                                            this._successMessages,
                                            msg => msg,
                                            (msg, index) =>
                                                html`
                                                    <div class="usa-alert usa-alert--success usa-alert--slim">
                                                        <div class="usa-alert__body">
                                                            <p class="usa-alert__text">${msg}</p>
                                                        </div>
                                                    </div>                                                
                                                `
                                            )}

                                    </div>
                                </div>
                                <div 
                                    style="width:100%; display:flex; justify-content:center"
                                >
                                    <button 
                                        class="usa-button usa-button--outline" 
                                        id="stopProgress2" 
                                        @click="${this._stoppingProgress}"
                                        style=${styleMap({display: this._hideStopButton ? 'none' : 'initial'})}
                                    >Stop</button>
                                    <button 
                                        class="usa-button usa-button--outline" 
                                        id="closeProgressModal2" 
                                        data-bs-dismiss="modal" 
                                        aria-label="Close" 
                                        style=${styleMap({display: this._hideCloseProgressModal ? 'none' : this._action !== 'download' ? 'initial' : 'none'})}
                                    >Next</button>
                                    <div
                                        style="display:${this._hideCloseProgressModal ? 'none' : this._action === 'download' ? 'flex' : 'none'}"
                                        >
                                            <button class="usa-button usa-button--outline" data-bs-dismiss="modal" onclick="$('#selectDownloadPageBackBtn').click()">Back to map</button>
                                            <button id="downloadToImportTable" class="usa-button usa-button--outline" data-bs-dismiss="modal">View import table</button>
                                    </div>
                                </div>
                            </div>
                            <!--<div id="loadedMessageContainer" style="display: none;">
                                <p id="loadedMessage">#### Loaded into database {DBName} from {SSA Parent Folder}</p>
                                <button class="btn" data-bs-dismiss="modal" aria-label="Close">Acknowledge</button>
                            </div>-->
                        </div>
                    </div>
                </div>
            </div>              
        `        
        ;
    }

    createRenderRoot(){
        return this;
    }

    intervalId;

    _startTimer(){
        this._timerDisplay = "00:00:00";
        let startTime = Date.now();
        this.intervalId = setInterval(
            ()=>{
                this._timerDisplay = this._formatTime(Date.now() - startTime)
            },
            1000);
    }

    _stopTimer() {
        clearInterval(this.intervalId);
        this.intervalId = undefined;
    }

    /**Halts the loading style and change bar to green. Only applies to the success bar. */
    _stopProgressBarSuccess(){
        this._successClasses['progress-bar-animated'] = false;
        this._successClasses['progress-bar-striped'] = false;
        this._successClasses['bg-success'] = true;
        this._successClasses['bg-danger'] = false;   
    }

    /**Halts the loading style and change bar to green. Only applies to the success bar.*/
    _stopProgressBarFail(){
        this._successClasses['progress-bar-animated'] = false;
        this._successClasses['progress-bar-striped'] = false;
        this._successClasses['bg-success'] = false;
        this._successClasses['bg-danger'] = true;        
    }    

    progressScreenSetup(subfolders, action) {

        this._startTimer();

        //Reset the display for loaded message and loading screen
        this._hideStopButton = false;
        this._hideCloseProgressModal = true;
        this._hideProgressListButton = true;
        //Reset loading bar
        this._successClasses['bg-info'] = false;
        this.successValue = 0;
        this.valueMax = subfolders.length;
        // this._successClasses['progress-bar-animated'] = true;
        // this._successClasses['progress-bar-striped'] = true;
        // this._successClasses['bg-danger'] = false;
        // this._successClasses['bg-success'] = false;

        this._successClasses = {
            "progress-bar":true, 
            "progress-bar-striped":true, 
            "progress-bar-animated":true, 
            "bg-danger": false, 
            "bg-success": false, 
            "bg-info": false
        }        

        //Reset failed loading bar
        this.failValue = 0;
        // this._failClasses['progress-bar-animated'] = true;   

        this._failClasses = {
            "progress-bar":true, 
            "progress-bar-striped":true, 
            "progress-bar-animated":true, 
            "bg-danger": true, 
            "bg-success": false, 
            "bg-info": false
        }        

        //Reset Error messages
        this._hideProgressErrorButton = true;
        this._successMessages = [];
        this._failMessages = [];
        this._action = action;

        this._toggleProgressScreen();

    }

    populateSuccessMessage(msg){
        this._successMessages.push(msg);
    }    

    populateErrorMessage(msg){
        this._failMessages.push(msg);
    }

    /**Populates the text in the toggleProgressErrorDiv*/
    _populateFailedProgressMessage(failedAreas, action){

        this._failClasses['progress-bar-animated'] = false;
        this._failClasses['progress-bar-striped'] = false;
        this._failClasses['bg-danger'] = true;              

        if(failedAreas.length > 0){
            this._hideProgressErrorButton = false;
        }        

        if(action == "download"){   
            this._errorListButtonText = `${failedAreas.length} Survey Areas have failed download.`;
        }else{
            let actionValue = action == 'import' ? "import" : "delete"; // using a ternary operator        
            this._errorListButtonText = `${Object.keys(failedAreas).length} areas have failed ${actionValue}.`;        
            //this._dispatchAlertEvent("error", alertMessage, this.toggleErrovDiv);
            //this.populateAlertBtnAccordions("error", alertMessage, this.toggleErrovDiv); 
        }

    }

    /**Populates a list of successfully imported/deleted areas on the progress screen*/
    _populateSuccessfulProgressMessage(loadedAreas, action){

        this._successClasses['progress-bar-animated'] = false;
        this._successClasses['progress-bar-striped'] = false;
        this._successClasses['bg-success'] = true;      

        //set attributes
        this._hideCloseProgressModal = false;
        if(loadedAreas.length > 0){
            this._hideProgressListButton = false;
        }
        //this.stopProgressButton.setAttribute("style", "display:none;");
        this._hideStopButton = true;
        //this.progressList.innerHTML = ""
        // this.progressTitle = '';
        if (action == "download") {            
            this.progressListButtonText = `Click to see list of downloaded Survey Areas`;
            //this._successMessages = loadedAreas.map(s => `${s} successfully downloaded.`);
        } 
        else {
            for (let folder in loadedAreas) {
                let actionValue = action == 'import' ? "imported" : "deleted"; // using a ternary operator
                let alertMessage = `${loadedAreas[folder]} successfully ${actionValue}.`; // need to swap between import/delete wording
                ///this._dispatchAlertEvent("success", alertMessage, this.progressList);
                //this.populateAlertBtnAccordions("success", alertMessage, this.progressList);     
                this._successMessages = [...this._successMessages, alertMessage];
            }
        }

    }

    stop(successAreas, failedAreas, action, success){
        this._stopTimer();
        if(!success){
            this._stopProgressBarFail();
        }        
        this._populateFailedProgressMessage(failedAreas, action);     
        if(success){
            this._stopProgressBarSuccess();
        }           
        this._populateSuccessfulProgressMessage(successAreas, action);
    }

    _stoppingProgress(){
        this._successClasses['bg-info'] = true;      
        this.progressTitle = `Stopping ${this._action}...`;
        //stopProgress = true;

        this._hideStopButton = true;
        this._stopTimer();

        const options = {
            detail: {
                stop: true
            },
            bubbles: true,
            composed: true
        };
        this.dispatchEvent(new CustomEvent('onStopAction', options));
        
    }
    
    _dispatchAlertEvent(alertType, alertMessage, parentElement){
        const options = {
            detail: {
                alertType: alertType,
                alertMessage: alertMessage,
                parentElement: parentElement
            },
            bubbles: true,
            composed: true
        };
        this.dispatchEvent(new CustomEvent('onPopulateAlert', options));
    }

    _toggleProgressScreen(){
        $("#progressScreen2").modal("toggle");               
    }

    /** Converts ms into a readable format (hh:mm:ss) */
    _formatTime(time){
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

}

customElements.define('progress-display', ProgressDisplayElement);