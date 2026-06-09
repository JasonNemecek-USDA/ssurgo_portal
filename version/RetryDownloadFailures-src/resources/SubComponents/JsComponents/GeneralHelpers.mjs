//Allows requests to send out to the server without going through sendData in ssurgo_portal_scripts.js
import { url } from "./Constants.mjs";

function sendLoggerWarning(message){
    const encodedMessage = encodeURIComponent(String(message ?? 'Unknown warning'))
    return fetch(`/tlogger/warning:${encodedMessage}`).catch(() => {})
}

export async function sendRequest(request){
    const controller = new AbortController();
    const timeoutID = setTimeout(() => controller.abort(), 200000000); //in milliseconds (~55.5 hours)

    try{
        const response = await fetch(url, {
            method : 'POST',
            headers: {'Content-Type' : 'application/json'},
            body: JSON.stringify(request),
            signal: controller.signal
        })

        if(!response.ok){
            throw new Error(`HTTP error! status: ${response.status}`)
        }

        return await response.json()
    }
    catch(err){
        const requestLabel = String(request?.request ?? 'unknown-request')
        if (err?.name === 'AbortError') {
            sendLoggerWarning(`sendRequest timed out for ${requestLabel}`)
        }
        sendLoggerWarning(`sendRequest failed for ${requestLabel}: ${String(err?.message ?? err)}`)
        //The message in the Modal below only covers one error scenario. Other error Modals are needed.
        $('#serverClosedModal').modal("show")
        return null
    }
    finally{
        clearTimeout(timeoutID)
    }
}