import {LitElement, html, css} from "./lit-all.min.mjs";

class MapComponentElement extends LitElement {

    _map;

    static properties = {
    }

    static styles = css`
    `;

    constructor() {
        super();
    } 

    firstUpdated(){
        const mapEl = this.renderRoot.querySelector('#mapId');
        if(!mapEl) return;
        this._map = L.map(mapEl, {
            center: [38,-96.3],
            zoom: 5,
            worldCopyJump: false
        });

        this._map.attributionControl.setPrefix("The United States government does not own, operate, or endorse the content of contributors' private websites. | Leaflet")        

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19,
            attribution: '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>'}).addTo(this._map);

        this._map.invalidateSize();
        
    }

    render() {

        return html`
            <link rel="stylesheet" href="leaflet/css/leaflet.css" type="text/css"/>
            <div id="mapId" style="box-sizing: border-box; z-index: 1; height: 500px; width: 80vw"></div>           
        `        
        ;
    }

    // createRenderRoot(){
    //     return this;
    // }

}

customElements.define('map-component', MapComponentElement);