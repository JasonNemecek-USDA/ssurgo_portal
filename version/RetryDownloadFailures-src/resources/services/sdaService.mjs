import ApiService from './apiService.mjs';
const apiService = new ApiService();

export async function checkSurveyAreas(localRecords, SDA_URL){

    let discrepancies = {
        "versionMismatch": [],
        "missingOnServer": [],
        "serverError": []
    };
    localRecords = (Array.isArray(localRecords) ? localRecords : [])
        .map((record) => {
            if (!record || typeof record !== 'object') {
                return null
            }

            const areaSymbol = record.areaSymbol ?? record.areasymbol ?? record.AREASYMBOL
            if (!areaSymbol) {
                return null
            }

            return {
                ...record,
                areaSymbol: String(areaSymbol),
            }
        })
        .filter((record) => record !== null)

    if (localRecords.length === 0) {
        return discrepancies
    }

    //sort records
    localRecords = localRecords.sort((a, b) => {
        if(a.areaSymbol < b.areaSymbol) {
            return -1;
        }
        else if(a.areaSymbol > b.areaSymbol) {
            return 1;
        }
        return 0;
    });

    let areaSymbols = localRecords.map(r => r.areaSymbol);

    //console.log(areaSymbols);

    let result = await getSurveyAreas(areaSymbols, SDA_URL);

    //console.log(result);

    if(result.status == "success"){
        //compare local and server records
        let serverRecords = result.records??[];
        //console.log(serverRecords);

        let i=0, j=0;
        do{
            const localRecord = localRecords[i];
            const serverRecord = serverRecords[j];

            if(!serverRecord || (localRecord.areaSymbol != serverRecord.areaSymbol)){
                //area symbol missing on the server
                discrepancies.missingOnServer.push(localRecord.areaSymbol);
            }else{
                if(localRecord.saversion != serverRecord.saversion){
                    discrepancies.versionMismatch.push(localRecord.areaSymbol);
                }      
                j++;                          
            }
            i++;

        }while(i<localRecords.length)

    }else{
        //discrepancies.push({areaSymbol: '', message: "serverError", error: result.error});
        discrepancies.serverError.push(result.error ?? result.message ?? "Unknown SDA error");
    }

    return discrepancies;

}

//const SDA_URL = "https://SDMDataAccess.sc.egov.usda.gov/Tabular/post.rest";

export async function getSurveyAreas(areaSymbols, SDA_URL){

    if (!areaSymbols || areaSymbols.length === 0) {
        return {status: "success", records: []};
    }

    if (!SDA_URL) {
        return {status: "error", message: "SDA URL is not configured", records: []};
    }

    let sqlQuery = `~DeclareVarchar255Table(@maTable)~;Insert into @maTable (s) values ${areaSymbols.map(value => `('${value}')`).join(', ')};SELECT * FROM SDA_Get_AreasymbolWktWgs84_from_AreasymbolTable(@maTable);`;

    try{
                
            //next query 
            sqlQuery = 
            `SELECT AREASYMBOL, AREANAME, CONVERT(varchar(10), [SAVEREST], 126) AS SAVEREST, SAVERSION FROM SASTATUSMAP WHERE AREASYMBOL IN (${areaSymbols.map(s => `'${s}'`).join(',')}) ORDER BY AREASYMBOL;`;

            const jsonObj = await apiService.post(SDA_URL, {'format': 'JSON', 'query': sqlQuery});
            //console.log(jsonObj);
            const sastatusmap_records = Array.isArray(jsonObj?.Table) ? jsonObj.Table : [];
            //console.log(sastatusmap_records);

            const records = sastatusmap_records.map(rec => {return {areaSymbol: rec[0], areaName: rec[1], saverest: rec[2], saversion: rec[3]}});

            return {status: "success", "records": records};

    }catch(error){
        console.error('Failed to execute SDA post query: ', error);
        return {status: "error", error: String(error), message: String(error), records: []};
    }

}