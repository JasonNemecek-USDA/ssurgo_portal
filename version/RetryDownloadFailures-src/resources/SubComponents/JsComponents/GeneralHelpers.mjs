//Allows requests to send out to the server without going through sendData in ssurgo_portal_scripts.js
import { url } from "./Constants.mjs";
export async function sendRequest(request){
    const controller = new AbortController();
    const timeoutID = setTimeout(() => controller.abort(), 200000000); //in milliseconds (~55.5 hours)
    const response = await fetch(url, {
        method : 'POST',
        headers: {'Content-Type' : 'application/json'},
        body: JSON.stringify(request),
        signal: controller.signal},
    ).catch(function(err){
        if (err.name === 'AbortError') {
            fetch('http://localhost:8083/tlogger/warning'+'Fetch request timed out')
        }
        fetch('http://localhost:8083/tlogger/warning'+err)
        //The message in the Modal below only covers one error scenario. Other error Modals are needed.
        $('#serverClosedModal').modal("show")
    })
    //then we make sure the response is in JSON and make a JSON object
    .then(response =>response.json()).then((response)=>{return response})
    clearTimeout(timeoutID)
    return response
}