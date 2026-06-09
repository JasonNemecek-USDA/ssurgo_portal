export default class BrowserStorageFunctions{
    /**Checks to see if cookie exists */
    static osPathSep = BrowserStorageFunctions.getOsPathSep()

    static getOsPathSep(){
        if(navigator.userAgent.includes("Windows")){
            return "\\"
        }
        else{
            return "/"
        }
    }
    static cookieExists(cookieName){
        let cookieSet = BrowserStorageFunctions.getCookie(cookieName)
        return cookieSet != undefined
    }
    /**Return cookie */
    static getCookie(cname){
        let cookie = {}
        document.cookie.split(';').forEach(function(el){
            let [key,value] = el.split('=')
            cookie[key.trim()] = value
        })
        return cookie[cname];
    }

    static setLocalStorage(name, value, defaultvalue = ""){
        if(value == undefined || value == null) value=defaultvalue
        localStorage.setItem(name, value)
    }

    static getLocalStorage(name){
        return localStorage.getItem(name)
    }
   static getUrlCookie(cname){
        let urlCookie = BrowserStorageFunctions.getCookie(cname);
        //If urlCookie is not set, do not try to replace anything.
        if(!urlCookie) return
        return urlCookie.replaceAll('"', "").replaceAll("'", "")
    }
}