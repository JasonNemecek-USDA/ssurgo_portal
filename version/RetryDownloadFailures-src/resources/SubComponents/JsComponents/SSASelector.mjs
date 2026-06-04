import {LitElement, html, repeat} from "../JsComponents/lit-all.min.mjs"

export default class SSASelectorElement extends LitElement {
    static properties = {
        runTotal:{type: Number},
        surveyAreas: {
            type:Array, 
            reflect:true,
            converter:{
                fromAttribute: (value, type) => {
                    // console.log('prop to attr');
                    // console.log(JSON.parse(value))
                    return JSON.parse(value)
                },
                toAttribute: (value, type) => {
                    // console.log('attr to prop');
                    // console.log(JSON.stringify(value))
                    return JSON.stringify(value);
                }
            }    
        },
    }

    constructor() {
        super();
        // this.surveyAreas = [
        //     {id: 'MA001', label: 'Barnstable County, Massachusetts'},
        //     {id: 'MA003', label: 'Berkshire County, Massachusetts'},
        //     {id: 'MA007', label: 'Dukes County, Massachusetts'},
        //     {id: 'MA011', label: 'Franklin County, Massachusetts'},
        //     {id: 'MA017', label: 'Middlesex County, Massachusetts'},
        //     {id: 'MA019', label: 'Nantucket County, Massachusetts'},
        //     {id: 'MA023', label: 'Plymouth County, Massachusetts'},
        // ];
        this.surveyAreas = [];
        this.DownloaderFunctionsItems = undefined
    } 

    // html renderer that populates the SSA dropdown
    render() {

        return html`
            <div id="downloadContainer" style="padding-top: 1.5em" aria-live="polite">
                <div class="label-container" id="label-container" 
                    style="
                        ${this.runTotal && this.runTotal > 0 ? `display: flex;` : `display: none;`}
                    justify-content: space-between; align-items: center; width: 90%;">
                    <span class="left-text" id="runTotal" style="text-align: left;">
                    <b>
                    ${this.runTotal ? 
                        (this.runTotal == 1) ?
                            this.runTotal + ' selected area' 
                            : this.runTotal + ' selected areas' 
                        : ""
                    }
                    </b>
                    </span>
                    <a href="#" class="usa-link" style="color:blue" 
                        @click=${()=> this._deleteAll()}
                    >Remove All</a>
                </div>

                <div id="downloadSSAContainer" style="position: relative;">
                    <ul id="ssaList" class="usa-list usa-list--unstyled">
                        ${!this.surveyAreas || this.surveyAreas.length == 0 ? 
                            html`                        
                                <li class="downloadTooltip" style="margin:2%"><p style="font-size: smaller;">To Select Soil Survey Areas<br> 1. Use area above to search for survey areas.<br>2. Click on a soil survey area in the map<br>3. Draw a rectangle or polygon with the map tools</p></li> 
                                <!--This container is populated by JavaScript-->                            
                                `
                            :
                            html`
                                ${repeat(
                                    this.surveyAreas,
                                    ssa => ssa.id,
                                    (ssa, index) =>
                                        html`
                                        <li style="white-space: nowrap;">
                                            <p style="margin: 2%">
                                                <img 
                                                    src="/static/images/delete_outline.svg" 
                                                    alt='Remove Areasymbol'
                                                    @click=${()=> this._deleteSSA(index)}
                                                    style="cursor: pointer; margin-right: 5px; height: 1em; margin-top: -5px;"
                                                >
                                                </img>
                                                <label for="${ssa.label}">
                                                ${ssa.label}
                                                </label>
                                            </p>                        
                                        </li>
                                        `
                                )}
                            
                            `
                        }
                    </ul>
                </div>                           

                <div id="downloadOverwriteFlgContainer" class="usa-checkbox">
                    <input type="checkbox" id="downloadOverwriteFlg" class="usa-checkbox__input" checked>
                    <label for="downloadOverwriteFlg" class="usa-checkbox__label"><b>Overwrite existing data</b></label>
                </div>

            </div>                     

        `        
        ;
    }

    getAreaSymbols(){
        return this.surveyAreas.map(s => s.id);
    }

    removeSurveyArea(areaSymbol){
        const index = this.surveyAreas.findIndex(s => s.id == areaSymbol);
        this._deleteSSA(index);
    }

    createRenderRoot(){
        return this;
    }

    // remove a single SSA from list
    _deleteSSA(index){
        const areaSymbol = this.surveyAreas[index].id;
        this.surveyAreas = this.surveyAreas.filter((_,i) => i != index);
        // this.currentRegions = selectedRegions.filter(item => !/\d/.test(item));
        const options = () => { 
            return(
                {
                    detail: {
                        areaSymbols: [areaSymbol],
                        // filter strings containing a numeric values to grab states (SSAs)
                        states: this.DownloaderFunctionsItems.selectedRegions.filter(item => !/\d/.test(item)),
                        ssas: this.DownloaderFunctionsItems.selectedRegions.filter(item => /\d/.test(item)),
                        _method: '_deleteSSA'
                    },
                    bubbles: true,
                    composed: true
                }
            )            
        };
        this.dispatchEvent(new CustomEvent('onssadelete', options()));
    }

    _deleteAll(){
        const areaSymbols = this.surveyAreas.map(s => s.id);
        this.surveyAreas = [];
        // this.currentRegions = selectedRegions.filter(item => !/\d/.test(item));
        const options = {
            detail: {
                areaSymbols,
                // filter strings containing a numeric values to grab states (SSAs)
                states: this.DownloaderFunctionsItems.selectedRegions.filter(item => !/\d/.test(item)),
                ssas: this.DownloaderFunctionsItems.selectedRegions.filter(item => /\d/.test(item)),
                _method: '_deleteAll'
            },
            bubbles: true,
            composed: true
        };
        this.dispatchEvent(new CustomEvent('onssadelete', options));        
    }

}

customElements.define('ssa-selector', SSASelectorElement);
