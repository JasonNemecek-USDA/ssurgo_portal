export default class LeafletComponent{
  constructor() {
        this._map = new L.map('mapIt', {
            center: [38,-96.3],
            zoom: 5,
            worldCopyJump: false
        });
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19,
            attribution: '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>'}).addTo(this._map);
        this.southWest = L.latLng(-55, -290); //(-89.98155760646617, -250);
        this.northEast = L.latLng(75, 20);
        this.bounds = L.latLngBounds(this.southWest, this.northEast);
        this._map.setMaxBounds(this.bounds);
        this._map.options.minZoom = 3;
        this.shapefileFeatureGroup = undefined;
        this._stateFeatureGeoJson = undefined;
        this.stateLayer = undefined;
        this._map.attributionControl.setPrefix("The United States government does not own, operate, or endorse the content of contributors' private websites. | Leaflet")
        this.factor = 1;
        this.zoomLevel = this._map.getZoom();
        this.weight = 1;
        this.mapLayerSSA = undefined;
        this.observers = [];

    };
    get stateFeatureGeoJson() {
        return this._stateFeatureGeoJson;
    }
    set stateFeatureGeoJson(newstateFeatureGeoJson) {
        if (newstateFeatureGeoJson !== this._stateFeatureGeoJson) {
            this._stateFeatureGeoJson = newstateFeatureGeoJson;
            this.notifyObservers();
        }
    }

    subscribe(observer) {
        this.observers.push(observer);
    }
    unsubscribe(observer) {
        this.observers = this.observers.filter((obs) => obs !== observer);
    }
    notifyObservers() {
        this.observers.forEach((observer) => observer(this.shapefileFeatureGroup));
    }

    // function to reconcile zoom levels with border weights
    calculateBorderWeight(){
        let baseWeight,
        weight,
        zoomLevel = this._map.getZoom();
        switch (true) {
            case (zoomLevel < 5):
                baseWeight = 0.5;
                weight = baseWeight * this.factor;
                break;
            case (zoomLevel < 7):
                baseWeight = 1;
                weight = baseWeight * this.factor;
                break;
            case (zoomLevel < 9):
                baseWeight = 2;
                weight = baseWeight * this.factor;
                break;
            case (zoomLevel < 12):
                baseWeight = 3;
                weight = baseWeight * this.factor;
                break;
            case (zoomLevel < 20):
                baseWeight = 4;
                weight = baseWeight * this.factor;
                break;
        }
        return weight;
    }

}