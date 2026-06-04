export default class ApiService {

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

    async postFormData(endpoint, params, signal) {
      try {

        const formData = new FormData();
        const timeoutSignal = AbortSignal.timeout(300000); // 5 minute timeout
        const combinedSignal = AbortSignal.any([signal, timeoutSignal]);
        (params??[]).forEach(param => {
          param.fileName ? 
            formData.append(param.name, param.value, param.fileName)
            : formData.append(param.name, param.value)
        })

        const response = await fetch(endpoint, {
          method: 'POST',
          body: formData,
          signal: combinedSignal
        });
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        return await response.json();
      } catch (error) {
        if (error.name === 'AbortError') {
          return {
            success: false,
            aborted: true,
            message: 'The request was aborted due to timeout or user cancellation.'
          }
        }
        this.handleError(error, "Error posting data")
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