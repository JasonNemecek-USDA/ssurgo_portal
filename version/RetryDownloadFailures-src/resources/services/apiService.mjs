export default class ApiService {

    sleep(ms){
      return new Promise((resolve) => setTimeout(resolve, ms));
    }

    handleError(error, message){
      if(error.name != "AbortError"){
        console.error(`${message}:`, error);
        throw error;
      }
    }
    async get(endpoint) {
      try {
        const response = await fetch(endpoint);
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        return await response.json();
      } catch (error) {
        console.error('Error fetching data:', error);
        throw error;
      }
    }
  
    async getReader(endpoint, signal){
      const response = await fetch(endpoint, {signal: signal});
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);  
      return response.body.getReader();
    }

    async getBlob(endpoint, signal){
      const attempts = 4;
      const timeoutMs = 150000;
      const retryDelayMs = 800;
      const maxRetryDelayMs = 8000;

      const getBackoffMs = (attemptNumber) => {
        const exponentialDelay = retryDelayMs * (2 ** (attemptNumber - 1));
        const jitter = Math.floor(Math.random() * 250);
        return Math.min(maxRetryDelayMs, exponentialDelay) + jitter;
      }

      for(let attempt = 1; attempt <= attempts; attempt++){
        try{
          const timeoutSignal = AbortSignal.timeout(timeoutMs);
          const combinedSignal = signal
            ? AbortSignal.any([signal, timeoutSignal])
            : timeoutSignal;

          const response = await fetch(endpoint, {signal: combinedSignal});
          if (!response.ok) {
            const retryableStatus =
              response.status === 408 ||
              response.status === 429 ||
              (response.status >= 500 && response.status < 600);

            if(retryableStatus && attempt < attempts){
              await this.sleep(getBackoffMs(attempt));
              continue;
            }

            throw new Error(`HTTP error! status: ${response.status}`);
          }

          return response.blob();
        }
        catch(error){
          const userAborted = Boolean(signal?.aborted);
          const timedOutAbort = error?.name === 'AbortError' && !userAborted;
          const errorMessage = String(error?.message ?? '').toLowerCase();
          const failedFetch =
            error instanceof TypeError ||
            errorMessage.includes('failed to fetch') ||
            errorMessage.includes('networkerror') ||
            errorMessage.includes('timed out');

          if(userAborted){
            throw error;
          }

          if((timedOutAbort || failedFetch) && attempt < attempts){
            await this.sleep(getBackoffMs(attempt));
            continue;
          }

          if(timedOutAbort){
            throw new Error(`Blob download timed out after ${Math.round(timeoutMs / 1000)} seconds.`);
          }

          throw error;
        }
      }

      throw new Error('Blob download failed after retries.');
    }

    async post(endpoint, data, signal) {
      try {
        const response = await fetch(endpoint, {
          method: 'POST',
        //   headers: {
        //     'Content-Type': 'application/json',
        //   },
          body: JSON.stringify(data),
          signal: signal
        });
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        return await response.json();
      } catch (error) {
        this.handleError(error, "Error posting data")
      }
    }

    // async postFormData(endpoint, name, blobValue, fileName) {
    //   try {

    //     const formData = new FormData();
    //     formData.append(name, blobValue, fileName);

    //     const response = await fetch(endpoint, {
    //       method: 'POST',
    //       body: formData,
    //     });
    //     if (!response.ok) {
    //       throw new Error(`HTTP error! status: ${response.status}`);
    //     }
    //     return await response.json();
    //   } catch (error) {
    //     console.error('Error posting data:', error);
    //     throw error;
    //   }
    // }    

    async postFormData(endpoint, params, signal, options = {}) {
      const attempts = options.attempts ?? 6;
      const timeoutMs = options.timeoutMs ?? 600000; // 10 minutes
      const retryDelayMs = options.retryDelayMs ?? 800;
      const maxRetryDelayMs = options.maxRetryDelayMs ?? 10000;

      const getBackoffMs = (attemptNumber) => {
        const exponentialDelay = retryDelayMs * (2 ** (attemptNumber - 1));
        const jitter = Math.floor(Math.random() * 250);
        return Math.min(maxRetryDelayMs, exponentialDelay) + jitter;
      }

      for(let attempt = 1; attempt <= attempts; attempt++){
        try {
          const formData = new FormData();
          (params ?? []).forEach(param => {
            param.fileName
              ? formData.append(param.name, param.value, param.fileName)
              : formData.append(param.name, param.value)
          })

          const timeoutSignal = AbortSignal.timeout(timeoutMs);
          const combinedSignal = signal
            ? AbortSignal.any([signal, timeoutSignal])
            : timeoutSignal;

          const response = await fetch(endpoint, {
            method: 'POST',
            body: formData,
            signal: combinedSignal
          });

          if (!response.ok) {
            const retryableStatus =
              response.status === 408 ||
              response.status === 429 ||
              (response.status >= 500 && response.status < 600);

            if (retryableStatus && attempt < attempts) {
              await this.sleep(getBackoffMs(attempt));
              continue;
            }

            throw new Error(`HTTP error! status: ${response.status}`);
          }

          return await response.json();
        } catch (error) {
          const userAborted = Boolean(signal?.aborted);
          const timedOutAbort = error?.name === 'AbortError' && !userAborted;
          const errorMessage = String(error?.message ?? '').toLowerCase();
          const failedFetch =
            error instanceof TypeError ||
            errorMessage.includes('failed to fetch');
          const canRetry = (timedOutAbort || failedFetch) && attempt < attempts;

          if (userAborted) {
            return {
              success: false,
              aborted: true,
              message: 'The request was aborted by user cancellation.'
            }
          }

          if (canRetry) {
            await this.sleep(getBackoffMs(attempt));
            continue;
          }

          if (timedOutAbort) {
            return {
              success: false,
              aborted: false,
              message: `The request timed out after ${Math.round(timeoutMs / 1000)} seconds.`
            }
          }

          if (failedFetch) {
            return {
              success: false,
              aborted: false,
              message: 'Network error while posting data. Please retry.'
            }
          }

          if (error?.message?.startsWith('HTTP error! status:')) {
            return {
              success: false,
              aborted: false,
              message: error.message
            }
          }

          this.handleError(error, "Error posting data")
        }
      }

      return {
        success: false,
        aborted: false,
        message: 'Request failed after retries.'
      }
    }

  
    async put(endpoint, data) {
      try {
        const response = await fetch(endpoint, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(data),
        });
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        return await response.json();
      } catch (error) {
        this.handleError(error, "Error updating data")
      }
    }
  
    async delete(endpoint) {
      try {
        const response = await fetch(endpoint, {
          method: 'DELETE',
        });
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        return await response.json();
      } catch (error) {
        this.handleError(error, "Error deleting data")
      }
    }
  }