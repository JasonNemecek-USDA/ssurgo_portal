# SSURGODownloader.py

# Allow a conditional import test, this will only throw 
# an execption if environment has not been initialized.
# Developer note: we have to do this to allow the import of X06.
import sys
import os
import traceback
import urllib
import shutil
import zipfile
import socket
import json
import io
import logging
from datetime import datetime
from time import sleep, time
from urllib.request import URLError, HTTPError, urlopen, urlretrieve
import multiprocessing as mp
import concurrent.futures as cf
import itertools as it
import config
from template_logger import tlogger
try:
    import requests
except:
    pass


class BulkDownloader:

    def __init__(self, request: str) -> None:
        #self.data = json.loads(request)
        self.outputFolder = request["downloaddir"]
        self.surveyList = request["soilsurveyareas"]
        self.overwriteFlg = request["overwriteflg"] if "overwriteflg" in request else False
        self.usercutoff = request["creationcutoff"] if "creationcutoff" in request else None
        self.formattedSSAList = []
        self.paramSet = []
        self.surveyCount = 0
        self.serverError = False

        """
        Adapted from https://github.com/alexwlchan/concurrently/blob/main/concurrently.py
        
        Generates (input, output) tuples as the calls to ``fn`` complete.

        See https://alexwlchan.net/2019/10/adventures-with-concurrent-futures/ for an explanation
        of how this function works.
        
        Parameters
        ----------
        fn : function
            The function that it to be run in parallel.
        max_concurrency : int
            Maximum number of processes, parameter for itertools islice function.
        iterSets : list
            List of dictionaries that will be iterated through. The keys of the dictionary
            must be the same for each dictionary and align with keywords of the function.
        constSets : dict
            Dictionary of parameters that constant for each iteration of the function
            ``fn``. Dictionary keys must align with function keywords.
        """
    def concurrently(self, fn, max_concurrency): #, iterSets, constSets ):
        try:
            # Make sure we get a consistent iterator throughout, rather than
            # getting the first element repeatedly.
            fn_inputs = iter(self.paramSet)
        
            with cf.ThreadPoolExecutor() as executor:
                # initialize first set of processes
                futures = {
                    executor.submit(fn, **params): params
                    for params in it.islice(fn_inputs, max_concurrency)
                }
                # Wait for a future to complete, returns sets of complete and incomplete futures
                while futures:
                    done, _ = cf.wait(
                        futures, return_when = cf.FIRST_COMPLETED
                    )
        
                    for fut in done:
                        # once process is done clear it out, yield results and params
                        original_input = futures.pop(fut)
                        yield original_input, fut.result()
                    
                    # Sends another set of processes equivalent in size to those just completed
                    # to executor to keep it at max_concurrency in the pool at a time,
                    # to keep memory consumption down.
                    futures.update({executor.submit(fn, **params): params
                    for params in it.islice(fn_inputs, len(done))
                    })

        except GeneratorExit:
            print('error2')
        except Exception as ex:
            print(f'error3: {ex}')

    @staticmethod
    def check_for_sapolygons():#myqueue: mp.Queue):
        """Try and access sapoly.geojson. If the file does not exist, or a newer sapolygon is discovered, download a new version of the file from WSS"""
        #TODO: put sapoly.geojson in config
        #If we are running debugging, save the file in the resources folder, otherwise save along side the pyz file
        if config.isPyzFile:
            file_path = os.path.join(os.path.dirname(sys.argv[0]),'sapoly.geojson')
        else:
            file_path = os.path.dirname(os.path.dirname(os.path.abspath(__file__))) + "/resources/sapoly.geojson"
        if not os.path.isfile(file_path):
            #myqueue.put(f"SA Polygon file does not exist: {file_path}")
            tlogger.info(f"SA Polygon file does not exist: {file_path}")
            BulkDownloader.download_sapoly_file(file_path)
        else:
            #find the most recent saverest date in the SA polygon geojson file
            with open(file_path, 'r') as file:
                ssa_data = json.load(file)
            saverest_dates = []
            for feature in ssa_data['features']:
                saverest = feature['properties'].get('saverest')
                if saverest:
                    date_only = saverest.split('T')[0]
                    saverest_dates.append(datetime.strptime(date_only, '%Y-%m-%d'))
            saverest_dates.sort(reverse=True)
            most_recent = saverest_dates[0] if saverest_dates else None

            #find the most recent saverest date in the definitive SA polygon web service
            query = '''SELECT TOP 1 CONVERT(varchar(10), [SAVEREST], 126) AS SAVEREST FROM SASTATUSMAP ORDER BY SAVEREST DESC'''
            url = config.get('sdaPostRestUrl')
            request = dict()
            request["format"] = "JSON"
            request["query"] = query
            data = json.dumps(request)
            data = data.encode('ascii')
            try:
                response = urlopen(url, data)
                result = json.loads(response.read().decode('utf-8'))
                last_edit = result['Table'][0][0] if result['Table'] else None
            except Exception as e:
                #Download could still work, but downloaded SA polygon layer may be out of date
                #myqueue.put(f"Can't get most recent SAVEREST for SDMDataAccess: {e}")
                tlogger.error(f"Can't get most recent SAVEREST for SDMDataAccess: {e}")
                return
            if most_recent is None or last_edit is None:
                #myqueue.put("Can't get SAVEREST dates.")
                tlogger.error("Can't get SAVEREST dates.")
            elif most_recent == datetime.strptime(last_edit, '%Y-%m-%d'):
                #myqueue.put(f"SA Polygons are up to date: {file_path}")
                tlogger.info(f"SA Polygons are up to date: {file_path}")
            elif most_recent < datetime.strptime(last_edit, '%Y-%m-%d'):
                try:
                    tlogger.info(f"Found a newer SA Polygon. Downloading new polygon file: {file_path}")
                    #myqueue.put(f"Updating SA Polygons: {file_path}")
                    os.rename(file_path, file_path + "_old")
                    BulkDownloader.download_sapoly_file(file_path)
                    os.remove(file_path + "_old")
                except FileNotFoundError:
                    #myqueue.put(f"{file_path} not found")
                    tlogger.error(f"{file_path} not found")
            else:
                #myqueue.put(f"Date mismatch: {file_path} claims to be more recent than SDMDataAccess version")
                tlogger.warning(f"Date mismatch: {file_path} claims to be more recent than SDMDataAccess version")
    
    @staticmethod
    def download_sapoly_file(file_path: str):
        """Download the sapoly.geojson file from WSS."""
        try:
            tlogger.info(f"Downloading sapoly.geojson from {config.get('sapolyDownloadUrl')} to {file_path}")
            print("Downloading new sapoly.geojson file")
            urlretrieve(config.get("sapolyDownloadUrl"), file_path)
            tlogger.info(f"Finished downloading sapoly.geojson")
            print(f"Finished downloading sapoly.geojson to {file_path}")
        except Exception as e:
            tlogger.error(f"Failed to download the sapoly.geojson file from {config.get('sapolyDownloadUrl')}: {e}")
            print("An error occured trying to download the sapoly.geojson file")

    def _clear_partial_survey_paths(self, areaSym, zipName):
        """Remove partially extracted survey data when unzip/download fails."""
        try:
            candidates = [areaSym, areaSym.upper(), zipName[:-4]]
            for candidate in candidates:
                candidate_path = os.path.join(self.outputFolder, candidate)
                if os.path.exists(candidate_path):
                    if os.path.isdir(candidate_path):
                        shutil.rmtree(candidate_path, ignore_errors=True)
                    else:
                        os.remove(candidate_path)
                    tlogger.info(f"Removed partial download path: {candidate_path}")
        except Exception as err:
            tlogger.warning(f"Failed to remove partial survey path: {err}")

    def _validate_extraction(self, areaSym, zipName, root_names):
        """Validate the extracted ZIP output contains the expected survey root folder."""
        expected_candidates = {areaSym, areaSym.upper(), zipName[:-4]}
        for extracted_name in root_names:
            if any(candidate == extracted_name or candidate in extracted_name for candidate in expected_candidates):
                return True
        return False

    ## ===================================================================================
    #function call in ProcessSurvey is currently commented out, so this is not used.
    #TODO: If we keep functionality of only older existing datasets being overwritten, this method needs to be resurrected
    def CheckExistingDataset(self, areaSym, surveyDate, newFolder):
        """Checks if a most current and complete download of the survey exist
        
        Parameters
        ----------
        areaSym : str
            The area symbol of current soil survey area being processed.
        surveyDate : str
            The date the soil survey area was updated on WSS.
        newFolder : str
            Path of the soil survey download.
        newDB : str
            Path for the soil survey Template, None if option not selected.

        Returns
        -------
        bool
            DESCRIPTION.

        """
        try:
            # file count per SSRUGO version 2.3.3    
            mainN = 5 # template database may not have been requested and is not needed
            spatN = 26
            tabN = 68
            spatF = os.path.join(newFolder, 'spatial')
            tabF = os.path.join(newFolder, 'tabular')
            saCatalog = os.path.join(tabF, "sacatlog.txt")
            
            dbDate = 0
            surveyDate = surveyDate.replace('-', '')
            
            # Check folders for completeness
            if len(os.listdir(newFolder)) >= mainN:
                if os.path.isdir(spatF) and len(os.listdir(spatF)) >= spatN:
                    if os.path.isdir(tabF) and len(os.listdir(tabF)) >= tabN:
                        if os.path.isfile(saCatalog):
                            fh = open(saCatalog, "r")
                            rec = fh.readline()
                            fh.close()
                            # Example date (which is index 3 in pipe-delimited file):  9/23/2014 6:49:27
                            vals = rec.split("|")
                            recDate = vals[3]
                            wssDate = "%m/%d/%Y %H:%M:%S"  # string date format used for SAVEREST in text file
                            intDate = "%Y%m%d"             # YYYYMMDD format for comparison
                            dateObj = datetime.strptime(recDate, wssDate)
                            dbDate = int(dateObj.strftime(intDate))
                            
                            if surveyDate <= dbDate:
                                # download_b = False
                                msgs = f"\nLocal dataset for {areaSym} already exists (date of {dbDate})"
                                return (1, msgs)
            # Current version is incomplete, remove and flag to download
            shutil.rmtree(newFolder, True)
            if os.path.isdir(newFolder):
                try:
                    shutil.rmtree(newFolder)
                except PermissionError as e:
                    msgs = f"Failed to delete obsolete dataset ({newFolder})"
                    msgs = msgs + f'\nPermission Error: {e}'
                    return [1, msgs]
            else:
                return (True, surveyDate)
            if os.path.isdir(newFolder): 
                msgs = f"Failed to delete obsolete dataset ({newFolder})"
                return (1, msgs)
            else: 
                return (0, surveyDate)

        except:
            func = sys._getframe(  ).f_code.co_name
            msgs = pyErr(func)
            return [2, msgs]

    ## ===================================================================================
    def GetDownload(self, areaSym, surveyDate):
        """download survey from Web Soil Survey URL    
        Only the version of zip file without a Template database is downloaded. The user
        must have a locale copy of the Template database that has been modified to allow
        automatic tabular imports.
        
        Parameters
        ----------
        areasym : str
            The area symbol of current soil survey area being processed.
        surveyDate : TYPE
            DESCRIPTION.
        newFolder : TYPE
            DESCRIPTION.

        Returns
        -------
        bool
            Successfull download.

        """
        
        # download survey from Web Soil Survey URL and return name of the zip file
        # want to set this up so that download will retry several times in case of error
        # return empty string in case of complete failure. Allow main to skip a failed
        # survey, but keep a list of failures
        #
        # Only the version of zip file without a Template database is downloaded. The user
        # must have a locale copy of the Template database that has been modified to allow
        # automatic tabular imports.

        # create URL string from survey string and WSS 3.0 cache URL
        baseURL = config.get("wssDownloadUrl")

        try: 
            # Use this zipfile for downloads without the Template database
            # date.fromisoformat(surveyDate)
            # zipDate = str(surveyDate)[0:4] + "-" + str(surveyDate)[4:6] + "-" + str(surveyDate)[6:8]
            zipName = f"wss_SSA_{areaSym}_[{surveyDate}].zip"

            # Use this URL for downloads with the state or US_2003 database
            #zipName = "wss_SSA_" + areaSym + db + "_[" + surveyDate + "].zip"

            zipURL = baseURL + zipName
            #TODO: send to logging file
            print(f"\tDownloading survey {areaSym} from Web Soil Survey...")

            # Open request to Web Soil Survey for that zip file
            os.makedirs(self.outputFolder, exist_ok=True)
            before_items = set(os.listdir(self.outputFolder))

            r = requests.get(zipURL, timeout=60)
            r.raise_for_status()

            zip_buffer = io.BytesIO(r.content)
            if not zipfile.is_zipfile(zip_buffer):
                raise zipfile.BadZipFile("Downloaded file is not a valid ZIP archive")

            zip_buffer.seek(0)
            with zipfile.ZipFile(zip_buffer) as z:
                bad_entry = z.testzip()
                if bad_entry:
                    raise zipfile.BadZipFile(f"ZIP integrity check failed on entry: {bad_entry}")

                root_names = {info.filename.split('/')[0] for info in z.infolist() if info.filename}
                z.extractall(path=self.outputFolder)

            if not self._validate_extraction(areaSym, zipName, root_names):
                raise zipfile.BadZipFile("Downloaded ZIP did not extract to the expected SSURGO survey folder")

            return [0, None]

        except requests.HTTPError as e:
            msgs = f'HTTP Error {e}'
            msgs = msgs + f"\n{zipURL}"
            tlogger.error(msgs)
            return [2, msgs]

        except requests.Timeout as e:
            msgs = 'Soil Data Access timeout error'
            tlogger.error(f"{msgs}\n{zipURL}")
            return [2, msgs]

        except requests.RequestException as e:
            msgs = f'Request error: {e}'
            msgs = msgs + f"\n{zipURL}"
            tlogger.error(msgs)
            return [2, msgs]

        except socket.error as e:
            msgs = f'Socket error: {e}'
            msgs = msgs + '\nAlso possible File Explorer needs tob be closed'
            msgs = msgs + f"\n{zipURL}"
            tlogger.error(msgs)
            return [2, msgs]
        
        except socket.timeout as e:
            msgs = f'Socket timeout error: {e}'
            msgs = msgs + f"\n{zipURL}"
            tlogger.error(msgs)
            return [2, msgs]

        except URLError as e:
            msgs = f'URL error: {e}'
            msgs = msgs + f"\n{zipURL}"
            tlogger.error(msgs)
            return [2, msgs]

        except HTTPError as e:
            msgs = f'HTTP error: {e}'
            msgs = msgs + f"\n{zipURL}"
            tlogger.error(msgs)
            return [2, msgs]
        
        except (zipfile.BadZipFile, zipfile.LargeZipFile) as e:
            msgs = f'Failed to unzip SSURGO file for {areaSym}: {e}'
            msgs = msgs + f"\n{zipURL}"
            tlogger.error(msgs)
            self._clear_partial_survey_paths(areaSym, zipName)
            return [2, msgs]
        
        except Exception as e:
            msgs = f'Unexpected download/unzip error for {areaSym}: {e}'
            msgs = msgs + f"\n{zipURL}"
            tlogger.error(msgs)
            self._clear_partial_survey_paths(areaSym, zipName)
            return [2, msgs]

    ## ===================================================================================
    #TODO: implement overwrite functionality
    #def ProcessSurvey(self, outputFolder, areaSym, surveyInfo, overwriteFlg):
    def ProcessSurvey(self, areaSym, surveyInfo):
        """Manages the download process for each soil survey
        
        Parameters
        ----------
        outputFolder : str
            Folder location for the downloaded SSURGO datasets.
        areaSym : str
            The area symbol of current soil survey area being processed.
        surveyInfo : list
            The date the soil survey area was updated on WSS and survey name

        Returns
        -------
        str
            keywords: 'Successful', 'Skipped',or 'Failed'.
        """
        # Download and import the specified SSURGO dataset

        try:
            # get date string
            surveyDate = surveyInfo[0].strip()
            # get survey name
            # set standard final path and name for template database
            # newFolder = f"{outputFolder}/soil_{areaSym.lower()}"
            # ---- Call CheckExistingDataset
            if not surveyDate:
                msgs = "No Survey Date in WSS SSA label"
                return [1, msgs]
            if self.overwriteFlg == False:
                if os.path.isdir(os.path.join(self.outputFolder,areaSym)):
                    msgs = 'Will not overwrite ' + areaSym
                    return [0, msgs]
            #TODO: fix this block if we want overwrite only with newer dataset functionality
            # if os.path.isdir(newFolder):
            #     cue, msgs = CheckExistingDataset(areaSym, surveyDate, newFolder)
            #     if cue:
            #         return [cue, areaSym, msgs]
            #     else:
            #         download_b = True
            # else:
            #     download_b = True
            # ---- Call GetDownload
            # First attempt to download zip file
            # if download_b:
                # Does it need to specify download with .mdb file?
            dcue, msg = self.GetDownload(areaSym, surveyDate) #, outputFolder)
            if dcue:
                # Try downloading zip file a second time
                sleep(20)
                dcue, msgs = self.GetDownload(areaSym, surveyDate) #, outputFolder)
                if dcue:
                    # Failed to download
                    return [dcue, msgs]
            msgs = '\tSurvey successfully downloaded'
            return [0, msgs]
        
        except:
            pass
            #TODO: print to log file (either here or to the method it returns to)
            #func = sys._getframe(  ).f_code.co_name
            #msgs = pyErr(func)
            #return [2, msgs]
        
    def getSSAString(self):
        sQuery = """
            SELECT AREASYMBOL, AREANAME, CONVERT(varchar(10), [SAVEREST], 126) AS SAVEREST
            FROM SASTATUSMAP
            WHERE AREASYMBOL IN ({})
            ORDER BY AREASYMBOL
        """.format(','.join(f"'{itm}'" for itm in self.surveyList))
        print(sQuery)
        url = config.get('sdaPostRestUrl')

        # Create request using JSON, return data as JSON
        dRequest = dict()
        dRequest["format"] = "JSON"
        dRequest["query"] = sQuery
        jData = json.dumps(dRequest)

        # Send request to SDA Tabular service using urllib2 library
        #The except blocks don't work. I tried using the tool when the server was down for maintenance (302 error) and it
        #still always fell through to 'REST access successful'
        #Refer to stackoverflow.com/questions/24518944/try-except-when-using-python-requests-module if I try this again.
        #The most promising solution is still raise_for_status(), even though it didn't initially work for me.
        jData = jData.encode('ascii')
        
        #TODO: nested try can be avoid and all exceptions (jsondecodeerror, httperror, urlerror) can be wrapped one exception blocked
        #Also, error messages need to be print to logs.
        try:
            response = urllib.request.urlopen(url,jData,timeout=10)
            try:
                jsonString = response.read()
                what = json.loads(jsonString)
            except json.decoder.JSONDecodeError as error:
                print('JSON error ' + error.msg)
                #self.serverError = True
        except HTTPError as error:
            print('Data not retrieved because ' + error) #.strerror)
            print(dRequest["query"])
            self.serverError = True
        except URLError as error:
            if isinstance(error.reason, socket.timeout):
                QgsMessageLog.logMessage('Socket timed out. ' + error.strerror)
                self.serverError = True
            else:
                QgsMessageLog.logMessage('Unknown server error')
                self.serverError = True
        else:
            pass #self.logger.info('REST access successful')
        
        if self.serverError == False:
            # Convert the returned JSON string into a Python dictionary.
            data = json.loads(jsonString)
            del jsonString, jData, response

            # Iterate through dataList and reformat the data to create the menu choicelist
            for rec in data["Table"]:
                areasym, areaname, date = rec
                
                #Currently all areasymbols are in the format of 2 letters followed by 3 numbers except MXNL001
                #Instead of hard coding this one exception, I am keeping track of exception(s) with this list.
                #Note that I make no attempt to capture possible exceptions < 5 chars.
                if len(areasym) > 5:
                    self.overFive.append(areasym)

                if not date is None:
                    date = date.split(" ")[0]

                else:
                    date = "None"
                    
                self.formattedSSAList.append(areasym + ",  " + str(date) + ",  " + areaname)

    def bulkDownload(self):
        # Use case 6a request: bulkDownload
        # Use case 6: "Download one or more SSAs into a containing folder that I specify."
        # Use "<script> ?bulkDownload" to retrieve schemas with request and response fields.
        #=> ['CA642,  2023-09-11,  Stanislaus County, California, Western Part',...]
        self.getSSAString()
        #for blah in self.formattedSSAList:
        #    ssa = blah.split(',')[0].strip().upper()
        #    date = blah.split(',')[1].strip()
        #    print("{};{};{}".format(ssa, date, self.outputFolder))
        #    self.GetDownload(ssa, date, self.outputFolder)
        #response = {"status": True, "allimported": True}
        #return response

        try:
            print(f"\n{len(self.formattedSSAList)} soil survey(s) selected for Web Soil Survey download")

            # ---- Prime For-loop
            # Create ordered list by Areasymbol
            # AREASYMBOL: Date, Survey Name, State
            # EX: CA101, 2023-09-06, Sutter County, California
            self.paramSet = [{'areaSym': s.split(',')[0].strip().upper(),
                    'surveyInfo': s.split(',')[1:]} 
                    for s in self.formattedSSAList
                    if s.split(',')[0].strip().upper() != 'HT600']
            self.surveyCount = len(self.paramSet)
            threadCount = min(mp.cpu_count(), self.surveyCount)
            print(f"\tRunning on {threadCount} threads.\n")
            successCount = 0
            failList = []
            # Run import process
            # ---- Call ProcessSurvey
            #constSet = {'outputFolder': self.outputFolder,'overwriteFlg':self.overwriteFlg}
            for paramBack, output in self.concurrently(self.ProcessSurvey,
                                                threadCount):#,
                                                #paramSet,
                                                #constSet):
                try:
                    outcome, msg = output
                    # arcpy.AddMessage(f"{msg}")
                    # arcpy.AddMessage(f"{outcome}: {paramBack}")
                    # ssa = paramBack[0]
                    if outcome == 0:
                        print(f"{paramBack['areaSym']}:\t\n{msg}")
                        successCount += 1
                    elif outcome == 1:
                        # arcpy.AddWarning(f"{ssa}:\n{msg}")
                        print(f"{paramBack['areaSym']}:\t\n{msg}")
                        failList.append(paramBack['areaSym'])
                    else:
                        # arcpy.AddError(f"{ssa}:\n{msg}")
                        print(f"{paramBack['areaSym']}:\t\n{msg}")
                        failList.append(paramBack['areaSym'])
                except GeneratorExit:
                    print('error')
                    pass
                        
            print("Processing complete...")
            print(f"\nSuccessfully downloaded {successCount} of {self.surveyCount} surveys.")
            if failList:
                print(f"\n{len(failList)} surveys failed to load:")
                for ssa in failList:
                    print(f"\t{ssa}")
                response = {"status": True, "allimported": False}
                return response
            else:
                response = {"status": True, "allimported": True}
                return response
        
        except:
            response = {"status": False, "allimported": False, "message": 'Failure during data download'}
            return response
        
    def deleteUnfinishedDownloads(self): 
        deleted_areas = []
        failed_deletes = []
        bypassed_deletes = []
        for item_name in os.listdir(self.outputFolder):
            try:
                item_path = os.path.join(self.outputFolder, item_name)
                for area in self.surveyList:
                    if area.lower() in item_name.lower():
                        if self.usercutoff != None:
                            creation_time = os.path.getctime(item_path)
                            cutoff = time() - (self.usercutoff*60*60)
                        if(self.usercutoff == None or creation_time > cutoff):
                            if not os.path.exists(item_path):
                                failed_deletes.append(item_name)
                                break
                            if os.path.isdir(item_path) or os.path.isfile(item_path):
                                if os.path.isdir(item_path):
                                    shutil.rmtree(item_path)
                                else:
                                    os.remove(item_path)
                                deleted_areas.append(item_name)
                                break
                        else:
                            bypassed_deletes.append(item_name)
            except Exception as e:
                tlogger.error(f"Tried deleting {item_path} but ran into {e}")
                failed_deletes.append(item_name)
        return {"status": True, "alldeleted": False if len(failed_deletes) != 0 else True, "deletedareas": deleted_areas, "faileddeletes": failed_deletes, "bypasseddeletes": bypassed_deletes}