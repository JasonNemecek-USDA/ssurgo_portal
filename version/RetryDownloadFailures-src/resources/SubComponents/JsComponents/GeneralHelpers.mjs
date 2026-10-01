//Allows requests to send out to the server without going through sendData in ssurgo_portal_scripts.js
import { url } from "./Constants.mjs";

function hideServerClosedModalIfVisible(){
    const serverClosedModal = $('#serverClosedModal')
    if(serverClosedModal && serverClosedModal.length > 0){
        serverClosedModal.modal('hide')
    }
}

function waitForDelay(delayMs){
    return new Promise((resolve) => setTimeout(resolve, delayMs))
}

async function confirmServerAvailability(maxAttempts = 2, retryDelayMs = 300){
    const endpoints = ['/serverStatus', '/startUp']

    for(let attempt = 1; attempt <= maxAttempts; attempt++){
        for(const endpoint of endpoints){
            try{
                const response = await fetch(endpoint, {method: 'GET', cache: 'no-store'})
                if(response.ok){
                    hideServerClosedModalIfVisible()
                    return true
                }
            }
            catch(error){
                // Retry alternate endpoint and next attempt.
            }
        }

        if(attempt < maxAttempts){
            await waitForDelay(retryDelayMs)
        }
    }

    return false
}

function sendLoggerWarning(message){
    const warningMessage = String(message ?? 'Unknown warning')
    return fetch('/tlogger', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
            level: 'warning',
            message: warningMessage,
            source: 'GeneralHelpers',
        }),
    })
        .then((loggerResponse) => {
            if(loggerResponse.ok){
                return loggerResponse
            }

            throw new Error(`logger post failed with status ${loggerResponse.status}`)
        })
        .catch(() => {
            const encodedMessage = encodeURIComponent(warningMessage)
            return fetch(`/tlogger/warning:${encodedMessage}`).catch(() => {})
        })
}

function isRetryableHttpStatus(statusCode){
    return [408, 425, 429, 500, 502, 503, 504].includes(statusCode)
}

function isRetryableFetchError(err){
    if(err?.name === 'AbortError'){
        return true
    }

    const message = String(err?.message ?? err)
    return /failed to fetch|networkerror|load failed|fetch/i.test(message)
}

function getRequestTimeoutMs(requestLabel){
    switch(requestLabel){
    case 'importcandidates':
        return 15 * 60 * 1000
    case 'generaterasters':
        return 30 * 60 * 1000
    case 'pretestimportcandidates':
        return 3 * 60 * 1000
    default:
        return 2 * 60 * 1000
    }
}

async function postJsonWithRetry(requestPayload, requestLabel, maxAttempts = 2, baseDelayMs = 250){
    const requestBody = JSON.stringify(requestPayload)
    let lastError = null
    const requestTimeoutMs = getRequestTimeoutMs(requestLabel)

    for(let attempt = 1; attempt <= maxAttempts; attempt++){
        const controller = new AbortController()
        const timeoutID = setTimeout(() => controller.abort(), requestTimeoutMs)

        try{
            const response = await fetch(url, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: requestBody,
                signal: controller.signal
            })

            if(!response.ok){
                const statusError = new Error(`HTTP error! status: ${response.status}`)
                if(isRetryableHttpStatus(response.status) && attempt < maxAttempts){
                    await waitForDelay(baseDelayMs * attempt)
                    continue
                }
                throw statusError
            }

            const payload = await response.json()
            return payload
        }
        catch(err){
            lastError = err
            if(isRetryableFetchError(err) && attempt < maxAttempts){
                await waitForDelay(baseDelayMs * attempt)
                continue
            }
            throw err
        }
        finally{
            clearTimeout(timeoutID)
        }
    }

    throw lastError ?? new Error('Unknown request failure')
}

export async function sendRequest(request){
    const requestLabel = String(request?.request ?? 'unknown-request')
    const maxAttempts = requestLabel === 'importcandidates' ? 3 : 2

    try{
        const payload = await postJsonWithRetry(request, requestLabel, maxAttempts, 250)
        hideServerClosedModalIfVisible()
        return payload
    }
    catch(err){
        const timeoutMs = getRequestTimeoutMs(requestLabel)
        const rawErrorMessage = String(err?.message ?? err)
        const isHttpStatusError = /^HTTP error! status:\s*\d+/i.test(rawErrorMessage)
        let warningMessage = ''
        if (err?.name === 'AbortError') {
            warningMessage = `sendRequest timed out for ${requestLabel} after ${timeoutMs}ms`
        }
        else{
            warningMessage = `sendRequest failed for ${requestLabel}: ${String(err?.message ?? err)} (attempts=${maxAttempts})`
        }

        sendLoggerWarning(warningMessage)

        const serverAvailable = await confirmServerAvailability(1, 0)
        if(!serverAvailable){
            $('#serverClosedModal').modal("show")
        }
        else{
            hideServerClosedModalIfVisible()
        }

        const isTransportError = !serverAvailable || (!isHttpStatusError && isRetryableFetchError(err))

        const uiErrorMessage = serverAvailable
            ? String(err?.message ?? `Request ${requestLabel} failed.`)
            : `Unable to connect to the local portal server while processing ${requestLabel}.`

        return {
            status: false,
            transporterror: isTransportError,
            request: requestLabel,
            serveravailable: serverAvailable,
            errormessage: uiErrorMessage,
            subfolders: []
        }
    }
}