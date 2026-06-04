import sys
import csv
from os import listdir, path, remove
from dlcore.dlutilities import DlUtilities
from utilities.runchild import RunChild
#import pandas as pd
import xml.etree.ElementTree as ET
import os

# hardcoded fix below for local dev.  Consider consolidating with gdal env logic found inside def checkEmptyShapefiles
#os.environ["PROJ_LIB"] = r"C:\Program Files\ArcGIS\Pro\Resources\pedata\gdaldata"

import subprocess
import time
import json
try:
    from osgeo import ogr, osr, gdal
    import dbf
    import numpy as np
    import pandas as pd
except:
    pass
import sqlite3
from template_logger import tlogger
import traceback
from typing import Tuple, Dict
from datetime import datetime
import config

timeTrials = config.get("enableTimeTrials")

# geospatial logic to functional space, independent to api.  is currently used in generaterasters()
def intersectingZones(debug = None):

    # projection zones seem somewhat arbitrarily created
    conus_bbox = ogr.CreateGeometryFromWkt('MULTIPOLYGON(((-126.52 50.2,-123.72 30.3,-100.8 28.3,-99.12 25.78,-78.99 23.83,-62.87 49.5,-126.52 50.2)))') #CONUS
    hi_bbox = ogr.CreateGeometryFromWkt('MULTIPOLYGON(((-161.36 21.75,-155.33 17.69,-153.2 20,-159.45 24.12,-161.36 21.75)))')             #Hawaii
    ak_bbox = ogr.CreateGeometryFromWkt('MULTIPOLYGON(((-164.119 72.751,-179.999 59.74,-179.999 46.936,-174.958 44.347,-128.057 54.599,-139.178 71.628,-164.119 72.751)),((170.392 51.868,179.999 46.936,179.999 59.74,170.392 51.868)))') #Alaska
    pr_bbox = ogr.CreateGeometryFromWkt('MULTIPOLYGON(((-68.025 18.744,-68.025 17.621,-65.2 17.621,-65.2 18.744,-68.025 18.744)))')        #Puerto Rico
    gu_bbox = ogr.CreateGeometryFromWkt('MULTIPOLYGON(((144.6 13.22,144.97 13.22,144.97 13.66,144.6 13.66,144.6 13.22)))')                 #Guam
    vi_bbox = ogr.CreateGeometryFromWkt('MULTIPOLYGON(((-65.13 17.64,-64.53 17.64,-64.53 18.45,-65.13 18.45,-65.13 17.64)))')              #US Virgin Islands
    mh_bbox = ogr.CreateGeometryFromWkt('MULTIPOLYGON(((170.9 8.8,170.9 6,171.8 6,171.8 8.8,170.9 8.8)))')                                 #Marshall Islands
    mp_bbox = ogr.CreateGeometryFromWkt('MULTIPOLYGON(((145.04 14,146.06 14,146.06 18.9,145.04 18.9,145.04 14)))')                         #Northern Marianas 
    pw_bbox = ogr.CreateGeometryFromWkt('MULTIPOLYGON(((131 2.86,134.8 2.86,134.8 8.18,131 8.18,131 2.86)))')                              #Palau
    as_bbox = ogr.CreateGeometryFromWkt('MULTIPOLYGON(((-170.86 -14.39,-169.4 -14.39,-169.4 -14.14,-170.86 -14.14,-170.86 -14.39)))')      #American Samoa
    fm_bbox = ogr.CreateGeometryFromWkt('MULTIPOLYGON(((137.8 10.2,137.8 5,163.33 5,163.33 10.2,137.8 10.2)))')                            #Federation of Micronesia
    mx_bbox = ogr.CreateGeometryFromWkt('MULTIPOLYGON(((-100.88 27.2,-100.88 27.07,-100.76 27.07,-100.76 27.2,-100.88 27.2)))')            #Mexico
    #each set has a bounding box, name to be appended to the raster file name, EPSG code for the coodinate system "zone" it is in
    #for a shortcut in the preprocessing steps, CONUS needs to be last
    proj_zones = [(conus_bbox,'',5070),
                    (pr_bbox,'_Puerto_Rico',32161),
                    (vi_bbox,'_Virgin_Is',32161),
                    (mx_bbox,'_Mexico',5070),
                    (ak_bbox,'_Alaska',3338),
                    (mh_bbox,'_Marshall_Is',4326),
                    (gu_bbox,'_Guam',4326),
                    (mp_bbox,'_Northern_Mariana_Is',4326),
                    (pw_bbox,'_Palau',4326),
                    (as_bbox,'_American_Samoa',4326),
                    (hi_bbox,'_Hawaii',4326),
                    (fm_bbox,'_Fed_States_Micronesia',4326)
                    ]
    if debug:
        combined_bbox = (conus_bbox.Union(mx_bbox).Union(pr_bbox).Union(vi_bbox).Union(ak_bbox).Union(mh_bbox).Union(gu_bbox)
                         .Union(mp_bbox).Union(pw_bbox).Union(as_bbox).Union(hi_bbox).Union(fm_bbox)).ExportToJson()
        print(combined_bbox)

    return (proj_zones)

class dataloader:

    @staticmethod
    def setcsvfieldsizelimit():
        maxInt = sys.maxsize
        while True:
    # decrease the maxInt value by factor 10 
    # as long as the OverflowError occurs.
            try:
                csv.field_size_limit(maxInt)
                break
            except OverflowError:
                maxInt = int(maxInt/10)
    

    def getSacatalogData(database: str, root: str, subfolder: str, getDbversion: str) -> Tuple[bool, str, str, str]:
        # Retrieve areasymbol and saversion for the subfolder
        # usage: (status, message, errormessage, areasymbol) = getSacatalogData(database, root, subfolder)
        # Status is True if the sacatlog.txt file can be read and returns the areasymbols for a given subfolder name
        # areasymbols is dictionary in which key elements are SSAs and values are saverest
        try:
            sacatalogFilename = 'sacatlog.txt'
            filePath = os.path.join(root, subfolder, "tabular", sacatalogFilename)
            areasymbols = {} 
            (status, errormessage) = DlUtilities.testFileExists(filePath, f"Error in {sacatalogFilename}")
            if not status: return (False, "", errormessage, areasymbols)
            (status, tbcon, errormessage) = DlUtilities.create_connection(database)
            if not status: return  (status, "Error encountered.", errormessage, areasymbols)
            with open(filePath, 'r', encoding='UTF-8', errors='ignore') as file:
                csvreader = csv.reader(file, delimiter='|', quotechar='"')
                for row in csvreader:
                    details = {}
                    details["areaname"] = str(row[1])
                    details["fileversion"] = str(row[3])

                    if getDbversion:
                        saverestquery = f"SELECT saverest from sacatalog where areasymbol = '{str(row[0])}';"
                        cursor = tbcon.cursor()
                        cursor.execute(saverestquery)
                        saverest = cursor.fetchone()
                        if saverest is None:
                            saverest = ""
                        else:
                            saverest = saverest[0]
                        details["dbversion"] = saverest
                    areasymbols[str(row[0])] = details
            if not tbcon:
                tbcon.close()

            if len(areasymbols.keys())==0:
                return (False, "", "No areasymbol found in sacatalog.txt", areasymbols)

            return (True, "", "", areasymbols)

        except Exception as ex:
            errormessage = f"Error while executing getsacatalog function in {subfolder}, Unexcepted error: {format(ex)}"
            tlogger.critical(errormessage)
            tlogger.critical(traceback.format_exc())
            return (False, "", errormessage, areasymbols)
    

    def checkTabularfolderpath(root: str, subfolder: str) -> Tuple[bool, str, str]:
        #Usage: (status, message, errormessage) = checkTabularFolderPath(root, subfolder)
        try:
            tbfolderdir = os.path.join(root, subfolder)
            if "tabular" in os.listdir(tbfolderdir):
                return (True,"","")
            else:
                return (False,"",f"tabular folder is either invalid (case sensitive, lower case required) or missing in folder {subfolder}")
        except Exception as ex:
            errormessage = f"Error while executing checkTabularfolderpath function in {subfolder}, Unexcepted error: {format(ex)}"
            tlogger.critical(errormessage)
            tlogger.critical(traceback.format_exc())
            return (False, "", errormessage)
    

    def checkSpatialfolderpath(root: str, subfolder: str) -> Tuple[bool, str, str]:
        #Usage: (status, message, errormessage) = checkSpatialFolderPath(root, subfolder)
        try:
            spfolderdir = os.path.join(root, subfolder)
            if "spatial" in os.listdir(spfolderdir):
                return (True,"","")
            else:
                return (False,"",f"spatial folder is either invalid (case sensitive, lower case required) or missing in folder {subfolder}")
        except Exception as ex:
            errormessage = f"Error while executing checkSpatialfolderpath function in {subfolder}, Unexcepted error: {format(ex)}"
            tlogger.critical(errormessage)
            tlogger.critical(traceback.format_exc())
            return (False, "", errormessage)
    

    def checkVersion(database: str, root: str, subfolder: str) -> Tuple[bool, str, str]:
        #Usage: (status, message, errormessage) = checkversion(database, root, subfolder)
        try:
            versioncheckquery = f"SELECT value from systemtemplateinformation where name ='SSURGO Version';"
            (status, tbcon, errormessage) = DlUtilities.create_connection(database)
            if not status:
                return  (status, "Error encountered.", errormessage)
            cursor = tbcon.cursor()
            cursor.execute(versioncheckquery)
            stiversion = (cursor.fetchone())[0]

            versionfilename = 'version.txt'
            tbfolderpath = os.path.join(root, subfolder, "tabular")
            filePath = os.path.join(root, subfolder, "tabular", versionfilename)
            (status, errormessage) = DlUtilities.testFileExists(filePath, f"Error in {versionfilename}")
            if not status: return (False,"", errormessage)
            
            with open(filePath, 'r', encoding='UTF-8') as file:
                tbversion = (file.read().splitlines())[0]

            if tbcon:
                tbcon.close()

            if stiversion == tbversion:
                return (True, "", "")
            else:
                return (False, "", f"SSURGO version {tbversion} doesn't match database version {stiversion}")   

        except Exception as ex:
            errormessage = f"Error while executing checkVersion function in {subfolder}, Unexcepted error: {format(ex)}"
            tlogger.critical(errormessage)
            tlogger.critical(traceback.format_exc())
            return (False, "", errormessage)


    def checkEmptyShapefiles(database: str, root: str, subfolder: str, ssurgoSource: str, areasym) -> Tuple[bool, str, str]: 
        #Usage: (status, message, errormessage) = checkEmptyShapefiles(database, root, subfolder, areasym)
        try:
            driver = ogr.GetDriverByName('ESRI Shapefile')
            #shpfilenamelst = [ f"soilsa_a_{areasym}.shp", f"soilmu_a_{areasym}.shp" ]
            (status, tbcon, errormessage) = DlUtilities.create_connection(database)
            if not status: 
                return  (status, "Error encountered.", errormessage)
            cursor = tbcon.cursor()
            cursor.execute( "SELECT tabphyname,iefilename,iefilenameaoi from mdstattabs where tabphyname in ('sapolygon', 'mupolygon')" )
            tblist = cursor.fetchall()
            shapefileFolder = os.path.join(root, subfolder, 'spatial')

            if ssurgoSource == 'statsGo':
                tblist = [('^gsmsoilmu_a_[a-z][a-z].shp$')]        

            for rw in tblist:
                if ssurgoSource == 'standardSSurgo':
                    shpfilepath= os.path.join(shapefileFolder, str(rw[1]) + "_" + areasym  + ".shp")
                    shpfilename= str(rw[1]) + "_" + areasym + ".shp"
                elif ssurgoSource == 'customSSurgo':
                    shpfilepath= os.path.join(shapefileFolder, str(rw[2]) + ".shp")
                    shpfilename= str(rw[2]) + ".shp"
                else:
                    shpfilename = DlUtilities.getRegexMatches(shapefileFolder, rw)
                    shpfilepath = os.path.join(shapefileFolder, shpfilename[0])

                (status, errormessage) = DlUtilities.testFileExists(shpfilepath, 'Error with shapefile')
                if not status: return (False, "", errormessage)

                dataSource = driver.Open(shpfilepath, 0)    # 0 means read-only. 1 means writeable.
                if dataSource == None:
                    return(False, "", f"Unable to open the shapefile {shpfilename} in folder {subfolder}")
                layer = dataSource.GetLayer()
                hasfeature = False

                #This block will only be accessed the first time that checkEmptyShapefiles is called
                #This block acertains what proj.db to use.
                #If there is a problem with proj.db, the 'for feature in layer' statement, below, will fail.
                if config.get("checkProjLib"):
                    #set to false so this search for the right proj.db isn't done again. After being run the first time,
                    #the PROJ_LIB application environment variable will be set to the correct proj.db or the application
                    #will return a critical error.
                    config.set("checkProjLib",False)

                    #In most installations, PROJ_LIB is not set as an environment variable and SSURGO Portal knows
                    #   where to find its own proj.db file (contains projection information). 
                    #The only scenario where there was an issue was a user had an out of date proj.db that was in a
                    #   proj that was installed with Postgis and Postgis had set PROJ_LIB to that out of date proj.db
                    proj_lib = os.getenv('PROJ_LIB')
                    if proj_lib is not None:
                        useExisting = True  #flag re: should code try to use proj.db defined by PROJ_LIB

                        #GDAL wheel file appears to install library locally,
                        #so this should be C:\User\[username]\AppData\Roaming\Python\PythonXXX\site-packages
                        gdal_path = subprocess.check_output(['pip','show','gdal']).decode('utf-8')
                        gdal_path = [line.split(': ')[1].strip() for line in gdal_path.split('\n') if 'Location' in line][0]

                        #First see if proj.db is where it should be
                        if os.path.exists(os.path.join(gdal_path,'osgeo','data','proj','proj.db')):
                            os.environ['PROJ_LIB'] = os.path.join(gdal_path,'osgeo','data','proj')
                            useExisting = False                 #code found its own proj.db, so ignore one defined by PROJ_LIB
                        #Otherwise do a search.
                        else:
                            for gdal_root, dirs, files in os.walk(gdal_path):
                                if 'proj.db' in files:
                                    os.environ['PROJ_LIB'] = gdal_root
                                    useExisting = False
                                    config.set("checkProjLib",False)

                        #Trying to find the SSURGO installtion's proj.db failed (i.e. user might have it installed in an 
                        # unexpected location), so try to use the proj.db defined by PROJ_LIB
                        if useExisting:
                            #This is such an outlier case that I haven't tried to catch errors while connecting/querying proj.db
                            config.set("checkProjLib",False)    #set to false so this search for the right proj.db is only done once
                            conn = sqlite3.connect(os.path.join(proj_lib,'proj.db'))
                            cursor = conn.cursor()
                            cursor.execute("SELECT value FROM metadata WHERE key='DATABASE.LAYOUT.VERSION.MINOR'")
                            result = cursor.fetchone()

                            #I couldn't find out exactly why ogr objected to proj.db version 1.0, so this is my only test.
                            if int(result[0]) < 1:
                                print("Proj.db is out of date")
                                raise FileNotFoundError()

                for feature in layer:
                    hasfeature = True
                    break  

                if not hasfeature:
                    return (False, "", f"Shapefile {shpfilename} in folder {subfolder} is empty.")

            return (True, "", "")
        
        except FileNotFoundError:
            errormsg = "proj.db not found or is out of date"
            tlogger.critical(errormsg)
            return(False, '', errormsg)
        
        except Exception as ex:
            errormessage = f"Error while executing checkEmptyShapefiles function in {subfolder}, Unexcepted error: {format(ex)}"
            tlogger.critical(errormessage)
            tlogger.critical(traceback.format_exc())
            return (False, '', errormessage)


    def checkEPSGAuthorityCode(database: str, root:str, subfolder:str, ssurgoSource: str, areasym) -> Tuple[bool, str, str]:
        #Usage: (status, message, errormessage) = checkEPSGAuthorityCode(database, root, subfolder, areasym)

        try:
            driver = ogr.GetDriverByName('ESRI Shapefile')
            (status, tbcon, errormessage) = DlUtilities.create_connection(database)
            if not status:
                return  (status, "Error encountered.", errormessage)
            cursor = tbcon.cursor()
            cursor.execute("SELECT iefilename, iefilenameaoi from mdstattabs where tabletype in ('Spatial')")
            tblist = cursor.fetchall()
            shapefileFolder = os.path.join(root, subfolder, 'spatial')

            if ssurgoSource == 'statsGo':
                tblist = [('^gsmsoilmu_a_[a-z][a-z].shp$')]  

            for rw in tblist:
                if ssurgoSource == 'standardSSurgo':
                    shpfilepath= os.path.join(shapefileFolder, str(rw[0]) + "_" + areasym  + ".shp")
                    shpfilename= str(rw[0]) + "_" + areasym + ".shp"
                elif ssurgoSource == 'customSSurgo':
                    shpfilepath= os.path.join(shapefileFolder, str(rw[1]) + ".shp")
                    shpfilename= str(rw[1]) + ".shp"
                else:
                    shpfilename = DlUtilities.getRegexMatches(shapefileFolder, rw)
                    shpfilepath = os.path.join(shapefileFolder, shpfilename[0])
                if not os.path.exists(shpfilepath):
                    return (False, "", f"{shpfilename} file not found on path {subfolder}")
                dataSource = driver.Open(shpfilepath, 0)    # 0 means read-only. 1 means writeable.
                if dataSource == None:
                    return(False, "", f"Unable to open the shapefile {shpfilename} in folder {subfolder}")
                layer = dataSource.GetLayer()
                spatialRef = layer.GetSpatialRef()
                if spatialRef == None:
                    return (False, "", f"Coordinate system of shapefile {shpfilename} in folder {subfolder} is not WGS84")
                rootauthoritycode =  spatialRef.GetAuthorityCode(None)
                if rootauthoritycode != '4326':
                    return (False, "", f"Coordinate system of shapefile {shpfilename} in folder {subfolder} is not WGS84")
            return (True, "", "")
        except sqlite3.Error as error:
            return (False, f"Error while executing function checkEPSGAuthorityCode", str(error.args[0]))
        except Exception as ex:
            errormessage = f"Error while executing function checkEPSGAuthorityCode in {subfolder}, Unexcepted error: {format(ex)}"
            tlogger.critical(errormessage)
            tlogger.critical(traceback.format_exc())
            return (False, "", errormessage)

        finally:
            if tbcon:
                tbcon.close()

    def getrecordlistbytable(request):
        database = request["database"]
        (status, errormessage) = DlUtilities.testFileExists(database, 'Error in "database"')
        if not status: return { "status": status, "errormessage": errormessage}
        tbname = request["table"]
        getsdvdata = "select * from " + str(tbname) +";"
        (status, tbcon, errormessage) = DlUtilities.create_connection(database) 
        cursor = tbcon.cursor()
        cursor.execute(getsdvdata)   
        rows = cursor.fetchall()
        columns = [d[0] for d in cursor.description]
        recordlist = [([dict(zip(columns, row)) for row in rows])]
        response = {
            "status" : status,
            tbname : recordlist          
        }
        return response

    def getSDVAttributesByFolder(request):
        database = request["database"]
        (status, errormessage) = DlUtilities.testFileExists(database, 'Error in "database"')
        if not status: return { "status": status, "errormessage": errormessage}
        getsdvattributesbyfolderQuery = f'''
                SELECT sdvfolder.folderkey, sdvfolder.foldername, sdvfolder.folderdescription, sdvattribute.attributename, sdvattribute.attributedescription, sdvattribute.attributekey
                FROM sdvfolder
                INNER JOIN sdvfolderattribute on sdvfolder.folderkey = sdvfolderattribute.folderkey
                INNER JOIN sdvattribute on sdvattribute.attributekey = sdvfolderattribute.attributekey
                ORDER BY sdvfolder.foldername COLLATE NOCASE ASC, sdvattribute.attributename COLLATE NOCASE ASC'''
        (status, tbcon, errormessage) = DlUtilities.create_connection(database) 
        cursor = tbcon.cursor()
        cursor.execute(getsdvattributesbyfolderQuery)   
        rows = cursor.fetchall()
        columns = [d[0] for d in cursor.description]
        recordlist = []

        for row in rows: 
            if len(recordlist) == 0:
                recordlist.append({columns[0]:row[0],
                            columns[1]:row[1],
                            columns[2]:row[2],
                            'attributes':[{columns[3]:row[3], columns[4]:row[4], columns[5]:row[5]}]}) 
            else:
                folderLocation = next((i for i, item in enumerate(recordlist) if item["folderkey"] == row[0]), None)
                if folderLocation != None:
                        recordlist[folderLocation]['attributes'].append({columns[3]:row[3], columns[4]:row[4], columns[5]:row[5]})      
                else:                
                    recordlist.append({columns[0]:row[0],
                        columns[1]:row[1],
                        columns[2]:row[2],
                        'attributes':[{columns[3]:row[3], columns[4]:row[4], columns[5]:row[5]}]})
        
        #The formatting of the descriptions makes it impossible to to use in any json request strings
        #To facilitate script testing, remove these descriptions for a cleaner response string
        if 'ignoredescriptions' in request and request['ignoredescriptions'] == True:
            for folder in recordlist:
                if 'folderdescription' in folder:
                    del folder['folderdescription']
                for attribute in folder['attributes']:
                    if 'attributedescription' in attribute:
                        del attribute['attributedescription']
        response = {
            "status" : status,
            "recordlist" : recordlist
        }
        return response
    
    #Helper function to update dictionary with key / value pairs
    def addDictKeyValues(relationsDict, currentTable, name, text):
        childNode = relationsDict[currentTable]
        childNode[name] = text 

    #Build a dictionary of all the table relationships from the mdstatrshipdet metadata table
    def getDBChildRelationsSQL(rshipdetailRecords, sqlRelations, currentTable, currentKey, childKey, fromClause, whereClause):        
        #Create an empty dictionary key for each childTable (currentTable)
        sqlRelations[currentTable] = {}
        
        #Build From and Where clauses
        if (currentKey != ""): 
            fromClause += ("" if (len(fromClause) == 0) else ", ") + currentTable
            whereClause += ("" if (len(whereClause) == 0) else " and ") + childKey + "=" + currentKey

        #Add From / Where values to the sqlRelations dictionary for the current childTable (key) 
        dataloader.addDictKeyValues(sqlRelations, currentTable, "From", fromClause)
        dataloader.addDictKeyValues(sqlRelations, currentTable, "Where", whereClause)

        #Reset the childTable and dataRows after each iteration, then grab all records where ltabphyname is the currentTable
        childTable = ""
        dataRows = []
        for x in range(len(rshipdetailRecords)):
            if rshipdetailRecords[x]['ltabphyname'] == currentTable: 
                dataRows.append(rshipdetailRecords[x])

        #Iterate / recurse through each datarow, adding the relationships of each childTable to sqlRelations 
        for y in range(len(dataRows)):
            childTable = dataRows[y]["rtabphyname"]
            childKey = childTable + "." + dataRows[y]["rtabcolphyname"]
            currentKey = currentTable + "." + dataRows[y]["ltabcolphyname"]
            (sqlRelations) = dataloader.getDBChildRelationsSQL(rshipdetailRecords, sqlRelations, childTable, currentKey, childKey, fromClause, whereClause)
        return (sqlRelations)

    def getSDVRatingOptions(request): 
        database = request["database"]
        attributeKey = request["attributekey"]
        (status, errormessage) = DlUtilities.testFileExists(database, 'Error in "database"')
        if not status: return { "status": status, "errormessage": errormessage}
        #Get a row for a given attributekey
        getsdvattributerowsQuery = f'select * from sdvattribute where readytodistribute = 1 and attributeKey = {attributeKey}'
        (status, tbcon, errormessage) = DlUtilities.create_connection(database) 
        sdvAttributesCursor = tbcon.cursor()
        sdvAttributesCursor.execute(getsdvattributerowsQuery)   
        sdvAttributeRows = sdvAttributesCursor.fetchall()
        sdvAtrributesColumns = [d[0] for d in sdvAttributesCursor.description]
        sdvAttributesRecordList = [dict(zip(sdvAtrributesColumns, sdvAttributeRow)) for sdvAttributeRow in sdvAttributeRows]

        constraints = []
        startTime = datetime.now()
        #Logic for Basic Options. Only execute this logic if the given Attribute has a populated primaryconcolname
        if (sdvAttributesRecordList[0]['primaryconcolname'] != None):
            #Retrieve all the records from the mdstatrshipdet table
            rawRelationsQuery = f'''
                    select ltabphyname, rtabphyname, ltabcolphyname, rtabcolphyname from mdstatrshipdet'''
            dbRelationsCursor = tbcon.cursor()
            dbRelationsCursor.execute(rawRelationsQuery)
            rshipdetailRows = dbRelationsCursor.fetchall()
            rshipdetailcolumns = [d[0] for d in dbRelationsCursor.description]
            dbRelationsCursor.close()
            rshipdetailRecords = [dict(zip(rshipdetailcolumns, rshipdetailRow)) for rshipdetailRow in rshipdetailRows]
            
            #Build a dictionary of all the database table relationships from the mdstatrshipdet table
            (sqlRelations) = dataloader.getDBChildRelationsSQL(rshipdetailRecords, dict(), "mapunit", "", "", "", "")

            #Define variables that will be used to generate a dynamic query 
            at = sdvAttributesRecordList[0]['attributetablename']
            ac = sdvAttributesRecordList[0]['attributecolumnname']
            c1 = sdvAttributesRecordList[0]['primaryconcolname']
            c2 = sdvAttributesRecordList[0]['secondaryconcolname']
            #Retreive From and Where clauses from the sqlRelations dictionary for a given attribute table
            f = sqlRelations[at]['From']
            w = sqlRelations[at]['Where']

            selectConstraintsQuery = f'''SELECT DISTINCT {at}.{c1}{"" if c2 == None else f', {at}.{c2}'} FROM mapunit, {f} ON {w} WHERE '''
            if not config.get("disableMukeyWhereClause"):
                selectConstraintsQuery += "mapunit.mukey in (select distinct mukey from mapunit) and "
            selectConstraintsQuery += f"{at}.{ac} is not null and {at}.{c1} is not null "
            if c2 != None:
                selectConstraintsQuery += f"and {at}.{c2} is not null"

            (status, conn, errormessage) = DlUtilities.create_connection(database)
            conn.row_factory  = sqlite3.Row
            constraintsDf = pd.read_sql_query(selectConstraintsQuery, conn)
            conn.close()
            tbcon.close()
            if c2 is None:
                constraints = constraintsDf.sort_values([c1]).rename(columns={c1: 'primaryconstraint'})
            else:
                constraints = constraintsDf.sort_values([c1, c2]).groupby(c1)[c2].agg(list).reset_index().rename(columns={c1: "primaryconstraint", c2:"secondaryconstraint"})
            constraints = constraints.to_dict(orient="records")

            if not constraints: #if constraints dictionary is empty
                constraints = "Rating will not return results. Data is missing from one or more of the following columns from table " + at + ": " + ac + ", " + c1 + ", or " + c2 
        endTime = datetime.now()
        tlogger.info(f"Time to get primary and secondary options: {str(endTime - startTime)}")
        if timeTrials:
            print(f"Time to get primary and secondary options: {str(endTime - startTime)}")
        #END IF for Basic Options/ primaryconcolname

        #Get all the records from the sdvalgorithm table
        getsdvalgorithmrowsQuery = f'''
                select algorithmsequence, algorithmname, algorithmdescription from sdvalgorithm order by algorithmsequence'''
        (status, tbcon, errormessage) = DlUtilities.create_connection(database) 
        sdvAlgorithmCursor = tbcon.cursor()
        sdvAlgorithmCursor.execute(getsdvalgorithmrowsQuery)   
        sdvAlgorithmRows = sdvAlgorithmCursor.fetchall()
        sdvAlgorithmCursor.close()
        sdvAlgorithmColumns = [d[0] for d in sdvAlgorithmCursor.description]
        sdvAlgorithmRecordList = [dict(zip(sdvAlgorithmColumns, sdvAlgorithmRow)) for sdvAlgorithmRow in sdvAlgorithmRows]

        #Add the static descriptions to the descriptions dictionary
        descriptions = {"V0": "Aggregation is the process by which a set of component attribute values is reduced to a single value that represents the map unit as a whole.\n\nA map unit is typically composed of one or more &quot;components&quot;.  A component is either some type of soil or some nonsoil entity, e.g., rock outcrop.  For the attribute being aggregated, the first step of the aggregation process is to derive one attribute value for each of a map unit&apos;s components.  From this set of component attributes, the next step of the aggregation process derives a single value that represents the map unit as a whole.  Once a single value for each map unit is derived, a thematic map for soil map units can be rendered.  Aggregation must be done because, on any soil map, map units are delineated but components are not.\n\nFor each of a map unit&apos;s components, a corresponding percent composition is recorded.  A percent composition of 60 indicates that the corresponding component typically makes up approximately 60% of the map unit.  Percent composition is a critical factor in some, but not all, aggregation methods.",
                        "V1": "Components whose percent composition is below the cutoff value will not be considered.  If no cutoff value is specified, all components in the database will be considered.  The data for some contrasting soils of minor extent may not be in the database, and therefore are not considered.",
                        "V2": "The tie-break rule indicates which value should be selected from a set of multiple candidate values, or which value should be selected in the event of a percent composition tie.",
                        "V3": "This option indicates if a null value for a component should be converted to zero before aggregation occurs.  This will be done only if a map unit has at least one component where this value is not null.",
                        "V4": "For an attribute of a soil horizon, a depth qualification must be specified.  In most cases it is probably most appropriate to specify a fixed depth range, either in centimeters or inches.  The Bottom Depth must be greater than the Top Depth, and the Top Depth can be greater than zero.  The choice of \"inches\" or \"centimeters\" only applies to the depth of soil to be evaluated.  It has no influence on the units of measure the data are presented in.\n\nWhen \"Surface Layer\" is specified as the depth qualifier, only the surface layer or horizon is considered when deriving a value for a component, but keep in mind that the thickness of the surface layer varies from component to component.\n\nWhen \"All Layers\" is specified as the depth qualifier, all layers recorded for a component are considered when deriving the value for that component.\n\nWhenever more than one layer or horizon is considered when deriving a value for a component, and the attribute being aggregated is a numeric attribute, a weighted average value is returned, where the weighting factor is the layer or horizon thickness.",
                        "V5": "For an attribute that is recorded by month, a month range must be specified.  To specify a single month, set beginning month and ending month to the same month.  Be aware that January to December includes all 12 months, whereas December to January includes only December and January."}

        #Append all the Algorithm descriptions to the descriptions dictionary 
        for row in sdvAlgorithmRecordList: 
            val = "A" + str(row['algorithmsequence'])
            descriptions[val] = row['algorithmdescription']

        #Convert ALL Int-boolean flags from 1/0 to True/False (SQLite does not support Booleans, so we have to sanitize it here).
        sdvAttributesRecordList[0]['mapunitlevelattribflag'] = bool(sdvAttributesRecordList[0]['mapunitlevelattribflag'])
        sdvAttributesRecordList[0]['complevelattribflag'] = bool(sdvAttributesRecordList[0]['complevelattribflag'])
        sdvAttributesRecordList[0]['cmonthlevelattribflag'] = bool(sdvAttributesRecordList[0]['cmonthlevelattribflag'])
        sdvAttributesRecordList[0]['horzlevelattribflag'] = bool(sdvAttributesRecordList[0]['horzlevelattribflag'])
        sdvAttributesRecordList[0]['tiebreakruleoptionflag'] = bool(sdvAttributesRecordList[0]['tiebreakruleoptionflag'])
        sdvAttributesRecordList[0]['tiebreakrule'] = False if sdvAttributesRecordList[0]['tiebreakrule'] == -1 else True
        sdvAttributesRecordList[0]['dqmodeoptionflag'] = bool(sdvAttributesRecordList[0]['dqmodeoptionflag'])
        sdvAttributesRecordList[0]['monthrangeoptionflag'] = bool(sdvAttributesRecordList[0]['monthrangeoptionflag'])
        sdvAttributesRecordList[0]['interpnullsaszerooptionflag'] = bool(sdvAttributesRecordList[0]['interpnullsaszerooptionflag'])
        sdvAttributesRecordList[0]['interpnullsaszeroflag'] = bool(sdvAttributesRecordList[0]['interpnullsaszeroflag'])
        sdvAttributesRecordList[0]['basicmodeflag'] = bool(sdvAttributesRecordList[0]['basicmodeflag'])
        
        #The formatting of the descriptions makes it impossible to to use in any json request strings
        #To facilitate script testing, remove these descriptions for a cleaner response string
        if 'ignoredescriptions' in request and request['ignoredescriptions'] == True:
            for record in sdvAttributesRecordList:
                if 'attributedescription' in record:
                    del record['attributedescription']
                if 'maplegendxml' in record:
                    del record['maplegendxml']
            #Return only the objects required for testing
            response = {
                "status" : status,
                "sdvAttributeRecords" : sdvAttributesRecordList,
                "basicoptions" : constraints
            }
        #Response will return a status, descriptions, sdvAttributeRecordsList for a given attributeKey, sdvAlgorithmRecordList, and basic options for a rating
        else:
            response = {
                "status" : status,
                "descriptions" : descriptions, 
                "sdvAttributeRecords" : sdvAttributesRecordList,
                "sdvAlgorithmRecords" : sdvAlgorithmRecordList,
                "basicoptions" : constraints
            }
        return response 

    def pretestImportCandidates(request):
        database = request["database"] 
        root = request["root"]
        (status, errormessage) = DlUtilities.testFolderExists(root, 'Error in "root"')
        if not status: return { "status": status, "errormessage": errormessage}
        database = request["database"]
        (status, errormessage) = DlUtilities.testFileExists(database, 'Error in "database"')
        if not status: return { "status": status, "errormessage": errormessage}

        if "subfolders" in request:
            # Case: folder list supplied
            requestSubfolders = request["subfolders"]
        else:
            # Case: no folder list supplied, get all child folder names
            requestSubfolders = []
            for name in listdir(root):
                childPath = path.join(root, name)
                if  path.isdir(childPath):
                    # case: we have a folder
                    requestSubfolders.append(name)
        
        dataloader.setcsvfieldsizelimit()
        
        istabularonly = request["istabularonly"]
        subfolders = []
        isValidPretest = True

        for subfolder in requestSubfolders:

            (status, message, errormessage) = dataloader.checkTabularfolderpath(root, subfolder)         
            if not status:
                isValidPretest = status 
                subfolders.append({"childfoldername":subfolder, "preteststatus":status , "errormessage":errormessage, "areasymbols":""})
                continue

            if not istabularonly:
                (status, message, errormessage) = dataloader.checkSpatialfolderpath(root, subfolder)
                if not status:
                    isValidPretest = status 
                    subfolders.append({"childfoldername":subfolder, "preteststatus":status , "errormessage":errormessage, "areasymbols":""})
                    continue

            (status, message, errormessage, areasymbols) = dataloader.getSacatalogData(database, root, subfolder, True)
            if not status:
                isValidPretest = status 
                subfolders.append({"childfoldername":subfolder, "preteststatus":status , "errormessage":errormessage, "areasymbols":areasymbols})
                continue
            

            (status, message, errormessage) = dataloader.checkVersion(database, root, subfolder)
            if not status:
                isValidPretest = status 
                subfolders.append({"childfoldername":subfolder, "preteststatus":status , "errormessage":errormessage, "areasymbols":areasymbols})
                continue

            if not istabularonly:
                ssurgoSource = 'standardSSurgo'
                ssurgoDownloadRoot = os.path.join(root, subfolder)
                saaoifilename = 'aoi_a_aoi.shp'   #
                saaoifilepath = path.join(ssurgoDownloadRoot, 'spatial', saaoifilename)  #
                (status, errormessage) = DlUtilities.testFileExists(saaoifilepath, f"Error in {saaoifilepath}") #
                if status:
                    ssurgoSource = 'customSSurgo'

                if ssurgoSource != 'customSSurgo':
                    statsgo_regex = '^gsmsoilmu_a_[a-z][a-z].shp$'   #
                    statsgofilepath = path.join(ssurgoDownloadRoot, 'spatial')  #
                    (status, errormessage) = DlUtilities.testFileExists(statsgofilepath, f"Error in {statsgofilepath}", regex=statsgo_regex) #
                    if status:
                        ssurgoSource = 'statsGo'

                areasym = list(areasymbols.keys())[0].lower()

                (status, message, errormessage) = dataloader.checkEmptyShapefiles(database, root, subfolder, ssurgoSource, areasym)
                if not status: 
                    isValidPretest = status 
                    subfolders.append({"childfoldername":subfolder, "preteststatus":status , "errormessage":errormessage, "areasymbols":areasymbols})
                    continue
  
                (status, message, errormessage) = dataloader.checkEPSGAuthorityCode(database, root, subfolder, ssurgoSource, areasym)
                if not status:
                    isValidPretest = status 
                    subfolders.append({"childfoldername": subfolder,"preteststatus":status , "errormessage":errormessage,"areasymbols":areasymbols})
                    continue
                subfolders.append({"childfoldername": subfolder,"preteststatus": status , "errormessage":errormessage,"areasymbols":areasymbols})

            else:
                subfolders.append({"childfoldername": subfolder,"preteststatus": status , "errormessage":errormessage,"areasymbols":areasymbols})

        # Code logic for cross scanning of duplicate areasymbols using the folders with preteststatus = True
                
        filteredSubfolders = [subfolder for subfolder in subfolders if subfolder['preteststatus']]

        for subfolder in filteredSubfolders:
            sharedSSAs = {}
            # cross-overs
            for areasymbol in subfolder['areasymbols']:
                # Add data source to json response
                if areasymbol == 'US':
                    subfolder['datasource'] = 'STATSGO2'
                else:
                    subfolder['datasource'] = 'SSURGO'
                sharedFolders = []
                for otherSubfolder in filteredSubfolders:
                # Don't include our outer folder name in the innermost lists
                    if otherSubfolder['childfoldername'] != subfolder['childfoldername']:
                        if areasymbol in otherSubfolder['areasymbols']:
                            sharedFolders.append(otherSubfolder['childfoldername'])
                if sharedFolders:
                    sharedSSAs[areasymbol]=sharedFolders
                    # Only preserve results if any shared SSAs were found
            if sharedSSAs:
                subfolder['sharedSSAs'] = sharedSSAs
        
        # Code logic to log the pretest errors in all folders in log file
        if not isValidPretest:
            errorSubfolders = [subfolder for subfolder in subfolders if not subfolder['preteststatus']]
            for subfolder in errorSubfolders:
                tlogger.error(subfolder['childfoldername'] + ": " + subfolder['errormessage'])


        response = {
                "allpassed": isValidPretest,
                "status": True,
                "message":"",
                "errormessage": "", 
                "subfolders": subfolders   
            }

        return response

    # def importtabulardatausingpandas(db_file, data_file):
    #     try:
    #         start = time.time()
    #         con = dataloader.create_connection(db_file)
    #         #con.execute("PRAGMA foreign_keys = 1")
    #         ssa = os.path.basename(data_file)
    #         cursor = con.cursor()
    #         cursor.execute('select distinct daglevel from mdstattabs')
    #         rows = cursor.fetchall()

    #         dag = []

    #         for i in rows:
    #             dag.append(i[0])
    #         df = pd.read_sql_query("SELECT daglevel,tabphyname,iefilename,tabletype from mdstattabs where tabletype in ('Tabular in Tabular') ", con)
    #         tb_file_path =  os.path.join(data_file,'tabular')
    #         na_values = ["",
    #                  "#N/A",
    #                  "#N/A N/A",
    #                  "#NA",
    #                  "-1.#IND",
    #                  "-1.#QNAN",
    #                  "-NaN",
    #                  "-nan",
    #                  "1.#IND",
    #                  "1.#QNAN",
    #                  "<NA>",
    #                  #             "N/A",
    #                  #              "NA",
    #                  "NULL",
    #                  "NaN",
    #                  #             "n/a",
    #                  "nan",
    #                  "null"]
            
    #         for i in dag:                 # Loop through the dag levels [0,1,2,3,4,5,6]
    #             df2 = df[(df.daglevel==i) ]
    #             if df2.empty:             # If there is no table in Python dataframe for daglevel i
    #                 continue
    #             else:
    #                 for index, row in df2.iterrows():                                    
    #                     fldNames = []
    #                     queryFieldNames = "SELECT name, type FROM PRAGMA_TABLE_INFO('" + str(row['tabphyname']) + "');"
    #                     cursor.execute(queryFieldNames)
    #                     rows = cursor.fetchall()
    #                     fldInfo= [row for row in rows]
    #                     for fld in fldInfo:
    #                         fldName, fldType = fld
    #                         fldNames.append(fldName)
                            
    #                     f = pd.read_csv(os.path.join(tb_file_path,str(row['iefilename'])+ '.txt'),delimiter = '|',names = fldNames,na_values=na_values,keep_default_na=False,low_memory=False)
    #                     #print('\nPandas Dataframe content\n',f)               
    #                     f.to_sql(str(row['tabphyname']), con, if_exists='append',index=False)
    #                     #print('\nMetadata dag level {} file {} is loaded\n'.format(i,str(row['tabphyname'])))


    #         end = time.time()

    #         print(f"\n WSS tabular SSURGO files are loaded for SSA {ssa}. Runtime of the import program is {end - start}")


    #         if con:
    #             con.close()


    #         return (True,"All tabular files are loaded successfully in db file","")

    #     except sqlite3.Error as error:
    #         return (False,"Error while loading tabular data", str(error.args[0]))

    #     finally:
    #         if con:
    #             con.close()
    
    def importtabulardata(db_file: str, data_file: str, IncludeInterpretationSubRules: bool) -> Tuple[bool, str, str]:
        #usage (status, message, errormessage)= dataloader.importtabulardata (database, ssurgoDownloadRoot)
        try:
            (status, tbcon, errormessage) = DlUtilities.create_connection(db_file)
            if not status:
                return  (status, "Error encountered.", errormessage)
            tbcon.execute("PRAGMA foreign_keys = 1")
            cursor = tbcon.cursor()
            cursor.execute("SELECT daglevel,tabphyname,iefilename,tabletype from mdstattabs where tabletype in ('Tabular in Tabular') order by daglevel")
            tblist = cursor.fetchall()

            for rw in tblist:
                curValues = []
                queryFieldNames = "SELECT name FROM PRAGMA_TABLE_INFO('" + str(rw[1])  + "');" 
                cursor.execute(queryFieldNames)   
                rows = cursor.fetchall()
                src = len(rows) * ['?']
                tbfolderpath = os.path.join(data_file,'tabular')
                tbfilename = str(rw[2])+".txt"
                tbfilepath = os.path.join(tbfolderpath,str(rw[2])+".txt")
                (status, errormessage) = DlUtilities.testFileExists(tbfilepath, "Tabular file error")
                if not status: return (False, '', errormessage)
                
                #if str(rw[1]) == 'cointerp':
                #    na_values = ["","NULL","null"]
                #    f = pd.read_csv(tbfilepath,delimiter = '|',header=None, usecols=[0,1,2,3,4,5,6,11,12,15,16,17,18],names = ["cokey", "mrulekey", \
                #        "mrulename","seqnum","rulekey","rulename","ruledepth","interphr","interphrc","nullpropdatabool","defpropdatabool","incpropdatabool", \
                #        "cointerpkey"],na_values=na_values,keep_default_na=False,low_memory=False)
                #    newf = f[f.ruledepth==0]
                #    newf.to_sql(str(rw[1]), tbcon, if_exists='append',index=False)

                with open(tbfilepath,'r',  encoding='UTF-8', errors='ignore') as datafile:
                    filerows = csv.reader(datafile, delimiter='|', quotechar='"')
                    if str(rw[1]) == 'cointerp':

                        usecols = [0,1,2,3,4,5,6,11,12,15,16,17,18]
                        src = len(usecols) * ['?']
                        if not IncludeInterpretationSubRules: #Apply ruledepth filter if IncludeInterpretationSubRules is not selected
                            for filerow in filerows:
                                rwlst = []
                                if filerow[6] != '0':  
                                    continue
                                for i,val in enumerate(filerow):
                                    if i in usecols:
                                        if val.strip():
                                            rwlst.append(val.strip())
                                        else:
                                            rwlst.append(None)
                                    else:
                                        continue
                                curValues.append(tuple(rwlst))

                        else:
                            for filerow in filerows:
                                rwlst = []
                                for i,val in enumerate(filerow):
                                    if i in usecols:
                                        if val.strip():
                                            rwlst.append(val.strip())
                                        else:
                                            rwlst.append(None)
                                    else:
                                        continue
                                curValues.append(tuple(rwlst))
                        insertQuery = "INSERT INTO " + str(rw[1]) + " VALUES (" + ",".join(src) + ");"
                        cursor.executemany(insertQuery, curValues)
                        tbcon.commit()


                    else:                                 #Load tables which are not cointerp

                        for filerow in filerows:
                            curValues.append(tuple([val.strip() if val.strip() else None for val in filerow]))
                        insertQuery = "INSERT INTO " + str(rw[1]) + " VALUES (" + ",".join(src) + ");"
                        cursor.executemany(insertQuery, curValues)
                        tbcon.commit()


            (status, response, error) = dataloader.loadSDVtables(data_file, tbcon)
            if not status:
                return (status, response, str(error))

            return (True,"All tabular files are loaded successfully in db file","")
            
        except sqlite3.IntegrityError as e:
            return (False, "", f"Error while loading tabular data of file {tbfilepath}, {str(e.args[0])}") 

        except sqlite3.Error as error:
            return (False, "" ,f"Error while loading tabular data of file {tbfilepath}, {str(error.args[0])}")
        
        except Exception as ex:
            errormessage = f"Error while loading tabular data in function importtabulardata for file {tbfilepath}, Unexcepted error: {format(ex)}"
            tlogger.critical(errormessage)
            tlogger.critical(traceback.format_exc())
            return (False,"", errormessage)

        finally:
            if tbcon:
                tbcon.close()
    

    def createSdvattributeKeyTable(keyTablename: str, oldTablename: str, newTablename:str, conn: sqlite3.Connection) -> None:
        # Create the key comparison table and populate it.
        # This table simplifies the case definitions for deleting and importing data.
        sqlCreate = f'''create TEMP table temp.{keyTablename} (
            case_name text,
            n_attributekey int,
            n_attributename	text, 
            n_datetime text, 
            o_attributekey	text, 
            o_attributename	text, 
            o_datetime text, 
            o_n_attributekey_for_name text,
            o_n_datetime_for_name text);
        '''
        conn.execute(sqlCreate)
        conn.commit

        # The wlupdated values will be converted to a sortable form by use of 
        # a SQL expression like:
        #   (substr(xxx.wlupdated,7,4)||xxx.wlupdated)
        sqlPopulateKeyTable = f'''
            insert into temp.{keyTablename}
            select distinct 
            N.attributedescription [case_name],
            N.attributekey [n_attributekey], 
            N.attributename [n_attributename], 
            (substr(N.wlupdated,7,4)||N.wlupdated) [n_datetime], 
            O.attributekey [o_attributekey], 
            O.attributename [o_attributename], 
            IFNULL(substr(O.wlupdated,7,4)||O.wlupdated, '') [o_datetime],
            O_N.attributekey [o_n_attributekey_for_name], 
            IFNULL(substr(O_N.wlupdated,7,4)||O_N.wlupdated, '') [o_n_datetime_for_name]
            from {newTablename} [N]
            left join {oldTablename} [O] on N.attributekey = O.attributekey
            left join {oldTablename} [O_N] on N.attributename = O_N.attributename
    '''
        conn.execute(sqlPopulateKeyTable)
        conn.commit

        
    def updateSdvattribute(oldTablename: str, newTablename: str, tempDeletionTablename: str, 
                           tempAdditionTablename: str, conn: sqlite3.Connection) -> None:
        # Assuming data tables have been populated, apply proposed sdvattribute updates.
        # Data are pulled from the new table  (i.e., sourced from CSV SSURGO data) and merged 
        # into the "old" (i.e., the database table) table.
        # A temporary "key table" is utilized to hold data state for each record.
        # This helps define the relationships needed for some of the cases.

        # Usage:
        #   dataloader.updateSdvattribute(oldTablename, newTablename, 
        #       tempDeletionTablename, tempAdditionTablename, conn)
        # Populates the tempDeletionTablename, tempAdditionTablename tables.

        # Create and populate the key table
        keyTablename = 'temp_sdvattribute_keytable'
        dataloader.createSdvattributeKeyTable(keyTablename, oldTablename, newTablename, conn)

        # A note on naming conventions:
        #   "ak"    attributekey
        #   "an"    attributename
        #   "old"   data in the database sdvattribute table before updating
        #   "new"   data imported from a CSV file
        #   "n_"    pertains to the "new" data table
        #   "o_n_"    pertains to the "old" data table, keys matched on attributename
        #   "o_"    pertains to the "old" data table, keys matched on attributekey

        # Temporary tables are used to hold keys for record deletion and addition.
        # For development and diagnostic purposes, the "useTrueTempTables", if False,
        # forces utilization of permanent tables for later review.

        conn.execute(f'CREATE TEMP TABLE {tempDeletionTablename} (attributekey  INT)')
        conn.commit()
        conn.execute(f'CREATE TEMP TABLE {tempAdditionTablename} (attributekey  INT)')
        conn.commit()

        # Isolate the key values for deletion and addition of records in the database
        sqlDeletionKeys = f'INSERT INTO {tempDeletionTablename} (attributekey) '
        sqlAdditionKeys = f'INSERT INTO {tempAdditionTablename} (attributekey) '
        deletionUnionFragment = ''
        additionUnionFragment = ''

        # case 1: new record
        # where o_attributekey is null and o_n_attributekey_for_name is null 
        #   then (no deletion)
        #   then (add n_attributekey)
        sqlAdditionKeys += f'''
            {additionUnionFragment}
            -- case 1: new record
            SELECT n_attributekey [attributekey] FROM {keyTablename}
            WHERE o_attributekey IS NULL AND o_n_attributekey_for_name IS NULL
        '''
        additionUnionFragment = 'UNION'
        
        # case 2: (old) match ak, match an
        # where o_attributekey is not null and o_n_attributekey_for_name is not null 
        # and o_attributekey = o_n_attributekey_for_name
        # and n_datetime <= o_datetime
        #   then (no deletion)
        #   then (no addition)

        # case 3: (new) match ak, match an
        # where o_attributekey is not null and o_n_attributekey_for_name is not null 
        # and o_attributekey = o_n_attributekey_for_name
        # and n_datetime > o_datetime
        #   then (delete o_attributekey)
        #   then (add n_attributekey)
        sqlDeletionKeys += f'''
            {deletionUnionFragment}
            -- case 3: (new) match ak, match an
            SELECT o_attributekey [attributekey] FROM {keyTablename}
            WHERE o_attributekey IS NOT NULL AND o_n_attributekey_for_name IS NOT NULL
            AND o_attributekey = o_n_attributekey_for_name
            AND  n_datetime > o_datetime
        '''
        deletionUnionFragment = 'UNION'

        sqlAdditionKeys += f'''
            {additionUnionFragment}
            -- case 3: (new) match ak, match an
            SELECT n_attributekey [attributekey] FROM {keyTablename}
            WHERE o_attributekey IS NOT NULL AND o_n_attributekey_for_name IS NOT NULL
            AND o_attributekey = o_n_attributekey_for_name
            AND n_datetime > o_datetime
        '''

        # case 4: (old) match ak, new an
        # where o_attributekey is not null and o_n_attributekey_for_name is null 
        # and n_datetime <= o_datetime
        #   then (no deletion)
        #   then (no addition)    

        # case 5: (new) match ak, new an
        # where o_attributekey is not null and o_n_attributekey_for_name is null 
        # and n_datetime > o_datetime
        #   then (delete o_attributekey)
        #   then (add n_attributekey)
        sqlDeletionKeys += f'''
            {deletionUnionFragment}
            -- case 5: (new) match ak, new an
            SELECT o_attributekey [attributekey] FROM {keyTablename}
            WHERE o_attributekey IS  NOT NULL AND o_n_attributekey_for_name IS NULL
            AND n_datetime > o_datetime
        '''

        sqlAdditionKeys += f'''
            {additionUnionFragment}
            -- case 5: (new) match ak, new an
            SELECT n_attributekey [attributekey] FROM {keyTablename}
            WHERE o_attributekey IS  NOT NULL AND o_n_attributekey_for_name IS NULL
            AND n_datetime > o_datetime
        '''

        # case 6: (old) n_ak not found, an found at different ak
        # where o_attributekey is null and o_n_attributekey_for_name is not null 
        # and n_datetime <= o_n_datetime_for_name
        #   then (no deletion)
        #   then (no addition)  

        # case 7: (new) n_ak not found, an found at different ak
        # where o_attributekey is null and o_n_attributekey_for_name is not null 
        # and n_datetime > o_n_datetime_for_name
        #   then (delete o_n_attributekey_for_name)
        #   then (add n_attributekey)
        sqlDeletionKeys += f'''
            {deletionUnionFragment}
            -- case 7: (new) n_ak not found, an found at different ak
            SELECT o_n_attributekey_for_name [attributekey] FROM {keyTablename}
            WHERE o_attributekey IS NULL AND o_n_attributekey_for_name IS NOT NULL
            AND n_datetime > o_n_datetime_for_name
        '''

        sqlAdditionKeys += f'''
            {additionUnionFragment}
            -- case 7: (new) n_ak not found, an found at different ak
            SELECT n_attributekey [attributekey] FROM {keyTablename}
            WHERE o_attributekey IS NULL AND o_n_attributekey_for_name IS NOT NULL
            AND n_datetime > o_n_datetime_for_name
        '''    

        # case 8: (n_ak < o_ak < o_an) ak found, newer an found
        # where o_attributekey is not null and o_n_attributekey_for_name is not null 
        # and o_attributekey <> o_n_attributekey_for_name
        # and and n_datetime < o_datetime AND o_datetime < o_n_datetime_for_name
        #   then (no deletion)
        #   then (no addition)  

        # case 9: (n_ak < o_an < o_ak) ak found, newer an found
        # where o_attributekey is not null and o_n_attributekey_for_name is not null 
        # and o_attributekey <> o_n_attributekey_for_name
        # and n_datetime < o_n_datetime_for_name AND o_n_datetime_for_name < o_datetime
        #   then (no deletion)
        #   then (no addition)  

        # case 10: (o_ak < n_ak < o_an) ak found, newer an found
        # where o_attributekey is not null and o_n_attributekey_for_name is not null 
        # and o_attributekey <> o_n_attributekey_for_name
        # and o_datetime < n_datetime AND n_datetime < o_n_datetime_for_name
        #   then (delete o_attributekey)
        #   then (no addition) 

        sqlDeletionKeys += f'''
            {deletionUnionFragment}
            -- case 10: (o_ak < n_ak < o_an) ak found, newer an found
            SELECT o_attributekey [attributekey] FROM {keyTablename}
            where o_attributekey is not null and o_n_attributekey_for_name is not null 
            and o_attributekey <> o_n_attributekey_for_name
            and o_datetime < n_datetime AND n_datetime < o_n_datetime_for_name
        '''

        # case 11: (o_an < n_ak <  o_ak) ak found, newer an found
        # where o_attributekey is not null and o_n_attributekey_for_name is not null 
        # and o_attributekey <> o_n_attributekey_for_name
        # and o_n_datetime_for_name <  n_datetime and  n_datetime < o_datetime
        #   then (no deletion)
        #   then (no addition)    

        # case 12: (o_ak < o_an < n_ak) ak found, newer an found
        # where o_attributekey is not null and o_n_attributekey_for_name is not null 
        # and o_attributekey <> o_n_attributekey_for_name
        # and  o_datetime < and o_n_datetime_for_name AND o_n_datetime_for_name < n_datetime
        #   then (delete o_attributekey and o_n_attributekey_for_name)
        #   then (add n_attributekey)
        sqlDeletionKeys += f'''
            {deletionUnionFragment}
            -- case 12: (o_ak < o_an < n_ak) ak found, newer an found
            SELECT o_attributekey [attributekey] FROM {keyTablename}
            where o_attributekey is not null and o_n_attributekey_for_name is not null 
            and o_attributekey <> o_n_attributekey_for_name
            and  o_datetime < o_n_datetime_for_name AND o_n_datetime_for_name < n_datetime
        '''
        sqlDeletionKeys += f'''
            {deletionUnionFragment}
            -- case 12: (o_ak < o_an < n_ak) ak found, newer an found
            SELECT o_n_attributekey_for_name [attributekey] FROM {keyTablename}
            where o_attributekey is not null and o_n_attributekey_for_name is not null 
            and o_attributekey <> o_n_attributekey_for_name
            and  o_datetime < o_n_datetime_for_name AND o_n_datetime_for_name < n_datetime
        '''

        sqlAdditionKeys += f'''
            {additionUnionFragment}
            -- case 12: (o_ak < o_an < n_ak) ak found, newer an found
            SELECT n_attributekey [attributekey] FROM {keyTablename}
            where o_attributekey is not null and o_n_attributekey_for_name is not null 
            and o_attributekey <> o_n_attributekey_for_name
            and  o_datetime < o_n_datetime_for_name AND o_n_datetime_for_name < n_datetime
        '''    

        # case 13: (o_an < o_ak < n_ak) ak found, newer an found
        # where o_attributekey is not null and o_n_attributekey_for_name is not null 
        # and o_attributekey <> o_n_attributekey_for_name
        # and o_n_datetime_for_name < o_datetime AND o_datetime < n_datetime
        #   then (delete o_attributekey and o_n_attributekey_for_name)
        #   then (add n_attributekey)
        sqlDeletionKeys += f'''
            {deletionUnionFragment}
            -- case 13: (o_an < o_ak < n_ak) ak found, newer an found
            SELECT o_attributekey [attributekey] FROM {keyTablename}
            where o_attributekey is not null and o_n_attributekey_for_name is not null 
            and o_attributekey <> o_n_attributekey_for_name
            and o_n_datetime_for_name < o_datetime AND o_datetime < n_datetime
        '''
        sqlDeletionKeys += f'''
            {deletionUnionFragment}
            -- case 13: (o_an < o_ak < n_ak) ak found, newer an found
            SELECT o_n_attributekey_for_name [attributekey] FROM {keyTablename}
            where o_attributekey is not null and o_n_attributekey_for_name is not null 
            and o_attributekey <> o_n_attributekey_for_name
            and o_n_datetime_for_name < o_datetime AND o_datetime < n_datetime
        '''

        sqlAdditionKeys += f'''
            {additionUnionFragment}
            -- case 13: (o_an < o_ak < n_ak) ak found, newer an found
            SELECT n_attributekey [attributekey] FROM {keyTablename}
            where o_attributekey is not null and o_n_attributekey_for_name is not null 
            and o_attributekey <> o_n_attributekey_for_name
            and o_n_datetime_for_name < o_datetime AND o_datetime < n_datetime
        '''    

        # Populate the deletion and addition tables
        conn.execute(sqlDeletionKeys)
        conn.commit()
        conn.execute(sqlAdditionKeys)
        conn.commit()        
        

    def loadSDVtables(data_file: str, tbcon: sqlite3.Connection) -> Tuple[bool, str, str]:

        try:
            cursor = tbcon.cursor()
            cursor.execute("SELECT daglevel,tabphyname,iefilename,tabletype from mdstattabs where tabletype in ('SDV') order by daglevel")
            sdvtblist = cursor.fetchall()
            for rw in sdvtblist:
                sdvtbname = str(rw[1])
                csvfilename = str(rw[2])

                temptbname = f"temp_{sdvtbname}"

                createtmptable = f"CREATE TEMP TABLE temp.{temptbname} AS select * from {sdvtbname} where 1=0;"
                cursor.execute(createtmptable)
                tbcon.commit()

                queryFieldNames = f"SELECT name FROM PRAGMA_TABLE_INFO('{sdvtbname}');" 
                cursor.execute(queryFieldNames)   
                rows = cursor.fetchall()
                curValues = []
                columns = ",".join([ "["+str(row[0])+"]" for row in rows])
                src = len(rows) * ['?']
                tbfolderpath = os.path.join(data_file,'tabular')
                tbfilepath = os.path.join(tbfolderpath,csvfilename+".txt")
                (status, errormessage) = DlUtilities.testFileExists(tbfilepath, "SDV file error")
                if not status: return (False, '', errormessage)

                with open(tbfilepath,'r', encoding='UTF-8', errors='ignore') as datafile:
                    filerows = csv.reader(datafile, delimiter='|', quotechar='"')
                    for filerow in filerows:
                        curValues.append(tuple([val.strip() if val.strip() else None for val in filerow]))
                insertQuery = f"INSERT INTO temp.{temptbname} VALUES (" + ",".join(src) + ");"
                cursor.executemany(insertQuery, curValues)
                tbcon.commit()
            
                #iswlupdatedexist = True
                iswlupdatedquery = f"SELECT name FROM PRAGMA_TABLE_INFO('{sdvtbname}') where name = 'wlupdated';"

                cursor.execute(iswlupdatedquery)
                rows = cursor.fetchall()
                # if len(rows) == 0:
                #     iswlupdatedexist = False

                lst = columns.split(",")
                newcolumnslst = ["new."+x for x in lst]
                newcolumns = ",".join (newcolumnslst)

                querypknm = f"SELECT name FROM PRAGMA_TABLE_INFO('{sdvtbname}') where pk=1;"
                cursor.execute(querypknm)
                row = cursor.fetchone()
                pknm = str(row[0])

                # if not iswlupdatedexist:
                #     sqldelete = (f"DELETE FROM {sdvtbname} "
                #     f" WHERE {pknm} IN ( SELECT old.{pknm} FROM {sdvtbname} old" 
                #     f" INNER JOIN temp.{temptbname} new ON new.{pknm} = old.{pknm} );"
                #     )
                #     sqlinsert = (f"INSERT INTO {sdvtbname}"
                #     f" SELECT {newcolumns}"
                #     f" FROM temp.{temptbname} new ;"                    
                #     )
                # elif sdvtbname == 'sdvattribute':
                #     tempDeletionTablename = 'temp_delete_sdvattribute'
                #     tempAdditionTablename = 'temp_add_sdvattribute'
                #     dataloader.updateSdvattribute(sdvtbname, temptbname, tempDeletionTablename, tempAdditionTablename, tbcon)
                #     sqldelete = f'DELETE FROM {sdvtbname} WHERE attributekey IN (SELECT attributekey FROM {tempDeletionTablename})'
                #     sqlinsert = f'INSERT INTO {sdvtbname} select * from {temptbname} WHERE attributekey IN (SELECT attributekey FROM {tempAdditionTablename})'
                # else:
                #     sqldelete = (f"DELETE FROM {sdvtbname} "
                #     f" WHERE {pknm} IN ( SELECT old.{pknm} FROM {sdvtbname} old"
                #     f" INNER JOIN temp.{temptbname} new ON new.{pknm} = old.{pknm}"
                #     f" WHERE substr(new.wlupdated,7,4)||new.wlupdated > IFNULL(substr(old.wlupdated,7,4)||old.wlupdated, ''));"
                #     )
                #     sqlinsert = (f"INSERT INTO {sdvtbname}"
                #     f" SELECT {newcolumns}"
                #     f" FROM temp.{temptbname} new LEFT JOIN {sdvtbname} old ON new.{pknm} = old.{pknm}"
                #     f" WHERE substr(new.wlupdated,7,4)||new.wlupdated > IFNULL(substr(old.wlupdated,7,4)||old.wlupdated, '');"
                #     )    
                sqldelete = False
                sqlupdate = False
                sqlinsert = False

                if sdvtbname == 'sdvalgorithm':
                    # The sdvalgorithm table has no children, therefore we cann delete and import
                    # without worrying about child table constraints.
                    sqldelete = (f"DELETE FROM {sdvtbname} "
                    f" WHERE {pknm} IN ( SELECT old.{pknm} FROM {sdvtbname} old" 
                    f" INNER JOIN temp.{temptbname} new ON new.{pknm} = old.{pknm} );"
                    )
                    sqlinsert = (f"INSERT INTO {sdvtbname}"
                    f" SELECT {newcolumns}"
                    f" FROM temp.{temptbname} new ;"                    
                    )
                elif sdvtbname == 'sdvfolder':
                    # The sdvfolder table has a child table, therefore we can't drop records.
                    # We will rely upon a later houssekeeping step to remove no-longer-needed 
                    # records.
                    sqlinsert = (f"insert into {sdvtbname}" 
                    		f" select * from temp.{temptbname} [new]"
		                    f" where [new].folderkey not in (select folderkey from {sdvtbname})"
                    )
                    sqlupdate = (f"update {sdvtbname}"
                        		f" set foldersequence = new.foldersequence,"
                        		f" foldername = new.foldername,"
                        		f" folderdescription = new.folderdescription,"
                        		f" parentfolderkey = new.parentfolderkey,"
        		                f" wlupdated = new.wlupdated"
		                        f" from temp.{temptbname} [new]"
		                        f" where {sdvtbname}.folderkey = [new].folderkey"
		                        f" and substr([new].wlupdated,7,4)||[new].wlupdated > IFNULL(substr({sdvtbname}.wlupdated,7,4)||{sdvtbname}.wlupdated, '')"
                                )
                elif sdvtbname == 'sdvfolderattribute':
                    # The sdvfolder table has a child table, therefore we can't drop records.
                    # We will rely upon a later houssekeeping step to remove no-longer-needed 
                    # records.                 
                    sqlinsert = (f"insert into {sdvtbname}"   
		                        f" select * from temp.{temptbname} [new]"
                                f" where [new].attributekey not in (select attributekey from {sdvtbname})"
                                )
                elif sdvtbname == 'sdvattribute':
                    # While the sdvattribute table has no childern, it does require evaluation of 
                    # thirteen different record comparison cases. We pass responsibility for defining the 
                    # record keys for deletion and addition off to dataloader.updateSdvattribute(...).
                    tempDeletionTablename = 'temp_delete_sdvattribute'
                    tempAdditionTablename = 'temp_add_sdvattribute'
                    dataloader.updateSdvattribute(sdvtbname, temptbname, tempDeletionTablename, tempAdditionTablename, tbcon)
                    sqldelete = f'DELETE FROM {sdvtbname} WHERE attributekey IN (SELECT attributekey FROM {tempDeletionTablename})'
                    sqlinsert = f'INSERT INTO {sdvtbname} select * from {temptbname} WHERE attributekey IN (SELECT attributekey FROM {tempAdditionTablename})'

                if sqldelete:
                    cursor.execute(sqldelete)
                    tbcon.commit()  
                if sqlupdate:
                    cursor.execute(sqlupdate)
                    tbcon.commit()  
                if sqlinsert:  
                    cursor.execute(sqlinsert)
                    tbcon.commit()

                droptmptable = f"DROP TABLE IF EXISTS temp.{temptbname};"
                cursor.execute(droptmptable)
                tbcon.commit()

            return (True,"SDV tables loaded successfully","")
        
        except sqlite3.IntegrityError as ex:
            return (False, "" , f"Error while loading SDV data of file {tbfilepath}, {format(ex)}")

        except sqlite3.Error as ex:
            return (False, "", f"Error while loading SDV data of file {tbfilepath}, {format(ex)}")

        except Exception as ex:
            errormessage = f"Error while loading SDV data in function loadSDVtables for file {tbfilepath}, Unexcepted error: {format(ex)}"
            tlogger.critical(errormessage)
            tlogger.critical(traceback.format_exc())
            return (False,"", errormessage)
     
       
    def importtabularinspatialdata(db_file: str, data_file: str, ssurgoSource: str, ssa: str) -> Tuple[bool, str, str]:
        # Usage: (status, message, errormessage) = importtabularinspatialdata(db_file, data_file, ssa)

        if ssurgoSource == 'statsGo':
            return (True,f"StatsGo detected. Skipping SSurgo files","")

        try:
            (status, tbcon, errormessage) = DlUtilities.create_connection(db_file)
            if not status: return  (status, "", errormessage)
            cursor = tbcon.cursor()
            cursor.execute("SELECT daglevel,tabphyname,iefilename,iefilenameaoi,tabletype from mdstattabs where tabletype in ('Tabular in Spatial') order by daglevel")
            tblist = cursor.fetchall()

            for rw in tblist:
                curValues = []
                queryFieldNames = "SELECT name FROM PRAGMA_TABLE_INFO('" + str(rw[1])  + "');" 
                cursor.execute(queryFieldNames)   
                rows = cursor.fetchall()
                src = len(rows) * ['?']
                tbinspfolderpath = os.path.join(data_file,'spatial')
                if ssurgoSource not in ('customSSurgo','statsGo'):
                    tbspfilename = str(rw[2]) + "_" + ssa  + ".txt"
                else:
                    tbspfilename = str(rw[3]) + ".txt"
                tbinspfilepath = path.join(tbinspfolderpath, tbspfilename)
                (status, errormessage) = DlUtilities.testFileExists(tbinspfilepath, "Tabular/Spatial file error")
                if not status: return (status, '', errormessage)

                with open(tbinspfilepath,'r',  encoding='UTF-8', errors='ignore') as datafile:
                    filerows = csv.reader(datafile, delimiter='|', quotechar='"')
                    for filerow in filerows:
                        curValues.append(tuple([val.strip() if val.strip() else None for val in filerow]))
                insertQuery = "INSERT INTO " + str(rw[1]) + " VALUES (" + ",".join(src) + ");"
                cursor.executemany(insertQuery, curValues)
                tbcon.commit()

            return (True,f"All tabular in spatial files in folder {tbinspfolderpath} are loaded successfully in db file","")

        except sqlite3.Error as error:
            return (False,'', f"Error while loading tabular in spatial data: {format(error)}")

        except Exception as ex:
            errormessage = f"Error while executing importtabularinspatialdata for folder {tbinspfolderpath}, Unexcepted error: {format(ex)}"
            tlogger.critical(errormessage)
            tlogger.critical(traceback.format_exc())
            return (False,"", errormessage)

        finally:
            if tbcon:
                tbcon.close()
  

    def isGeopackage(db_path: str) -> Tuple[bool, bool, str]:
        # Determine whether the SQLite file is GeoPackage or not.
        # We only test whetehr the database is GeoPackage. There's no equivalent 
        # test for SpatiaLite, short of looking for existence of specific
        # tables that are unique to GeoPackage or SpatiaLite.
        # Parameter:
        #   db_path     Path to the SQLite database to be tested.
        # References:
        #  GeoPackage Encoding Standard (OGC) Format Family
        #  https://www.loc.gov/preservation/digital/formats/fdd/fdd000520.shtml
        #	Magic numbers	Hex: 47 50 4B 47
        #	ASCII: GKPG
        #	In the application_id field (byte offset 68) of the SQLite database header. 
        #	Specific to GeoPackage files. Applies to Version 1.2 and greater Version 
        #	1.0 has value "GP10". Version 1.1 has value "GP11".
        #  PRAGMA Statements
        #  https://www.sqlite.org/pragma.html#pragma_application_id
        #	PRAGMA schema.application_id;
        #	PRAGMA schema.application_id = integer ;
        #	The application_id PRAGMA is used to query or set the 32-bit signed 
        #	big-endian "Application ID" integer located at offset 68 ...
        # Usage: (status, isGeopackageTrue, errormessage) = isGeopackage(db_path)

        # Checking of several SpatiaLite files shows an identifier of four null bytes.
        # For GeoPackage, geopackage decimal: 1196444487 / hex  0x47504b47   'GPKG'
        try:
            geopackage_identifier = 1196444487
            sql = 'PRAGMA application_id;' 

            isGeopackageTrue = None
            (status, conn, errormessage) = DlUtilities.create_connection(db_path)
            if not status:
                return (status, isGeopackageTrue, errormessage)

            cur = conn.cursor()
            cur.execute(sql)
            identifier = (cur.fetchone())[0]
            isGeopackageTrue = identifier == geopackage_identifier
            return (True, isGeopackageTrue, "")
        except Exception as ex:
            errormessage = f"Error while executing function isGeopackage, Unexcepted error: {format(ex)}"
            tlogger.critical(errormessage)
            tlogger.critical(traceback.format_exc())
            return (False, isGeopackageTrue, errormessage)
    

    def getSqlString(db_path: str, tablename: str, shapefile_name:str , dissolvemupolygon: str) -> Tuple[bool, str, str]:
        # Get SQL string for use with gdal.VectorTranslate method.
        # Usage: (status, loadSql, errormessage)
        try:

            (status, conn, errormessage) = DlUtilities.create_connection(db_path)
            if not status:
                return (status, None, errormessage)

        # Database safety: the mupolygon table must support multipolygon
        # data for dissolve to succeed. If the type is not multipolygon then 
        # the dissolve setting will be ignored.

            if (dissolvemupolygon and tablename == "mupolygon"):
                columnTypeSql = "SELECT type FROM PRAGMA_TABLE_INFO('mupolygon') where name = 'shape';"
                curColumnType = conn.cursor()
                curColumnType.execute(columnTypeSql)
                rows = curColumnType.fetchall()
                columnType =  rows[0][0]
                curColumnType.close()
                if columnType == 'MULTIPOLYGON':
                    name = f'VectorTranslate_SQL_{tablename}_dissolve'  
                else:
                    name = f'VectorTranslate_SQL_{tablename}'
            elif shapefile_name == 'aoi_a_aoi':
                name = f'VectorTranslate_SQL_{tablename}_aoi'
            elif shapefile_name == 'statsGo_sapolygon':
                name = f'VectorTranslate_SQL_sapolygon_statsgo'
            else:
                name = f'VectorTranslate_SQL_{tablename}'

            infoSql = f"SELECT value FROM systemtemplateinformation WHERE name='{name}';"
            cur = conn.cursor()
            cur.execute(infoSql)
            rows = cur.fetchall()

            if shapefile_name == 'statsGo_sapolygon':
                loadSql = rows[0][0]
            else:
                loadSql = rows[0][0].replace('__shapename__', shapefile_name)            
            
            cur.close()
            conn.close()

            return (True, loadSql, "")

        except Exception as ex:
            errormessage = f"Error while executing function getSqlString, Unexcepted error: {format(ex)}"
            tlogger.critical(errormessage)
            tlogger.critical(traceback.format_exc())
            return (False, "", errormessage)  


    def loadShapefileData(tablename: str, shapefilefolder: str, shapefileName: str,  database: str, 
                          db_format: str, dissolvemupolygon: str) -> Tuple[bool, str, str]:
        # Returns (status, message, errormessage)
        try:
            shapefilePath = path.join(shapefilefolder, shapefileName + '.shp')
            (status, loadSql, errormessage) = dataloader.getSqlString(database, tablename, shapefileName, dissolvemupolygon)
            if not status:
                return (False, "Unable to open database.", errormessage)    
        except Exception as ex:
            return (False, "Error during spatial import", f"Error retrieving SQL query command, Unexcepted error: {format(ex)}")

        try: 
            gdal.UseExceptions()
            if shapefileName == 'aoi_a_aoi':           #This is to import WSS AOI sapolygon shape file
                subfolderpath = os.path.dirname(shapefilefolder)
                root = os.path.dirname(subfolderpath)
                subfolder = os.path.basename(subfolderpath)
                (status, message, errormessage, areasymbols) = dataloader.getSacatalogData(database, root, subfolder, False)
                if not status:
                    return (False, f"Error importing the shapefile {shapefileName}", "")
                areasymfilter = tuple(areasymbols)
                if len(areasymfilter) ==1:
                    areasymfilter = "('"+str(areasymfilter[0])+"')"

                loadSql = loadSql.replace('__areasymbols__', str(areasymfilter))

                gdal.VectorTranslate(database, database, SQLStatement = loadSql, 
                        SQLDialect = "INDIRECT_SQLITE", format=f'{db_format}', 
                        accessMode='append', layerName=tablename)
            
            elif shapefileName == 'statsGo_sapolygon':
                gdal.VectorTranslate(database, database, SQLStatement = loadSql, 
                        SQLDialect = "INDIRECT_SQLITE", format=f'{db_format}', 
                        accessMode='append', layerName=tablename)
            else:            
                gdal.VectorTranslate(database, shapefilePath, SQLStatement = loadSql, 
                        SQLDialect = "SQLite", format=f'{db_format}', 
                        accessMode='append', layerName=tablename)
                
            return (True, f"shapefile {shapefileName} imported", "")
        except Exception as ex:

            return (False, "", f"Error reading shapefile {shapefileName}, Unexcepted error: {format(ex)}")


    def loadAllShapefiles(childRequest) -> Tuple[bool, str, str]:
        # load all shapefiles, assume WSS format for spatial folder
        #print(f'ssurgoDownloadRoot: {ssurgoDownloadRoot}')
        # Usage: (status, message, errormessage, allimported) =  loadAllShapefiles(childRequest)
        try:
            db_path = childRequest["database"]
            shapefileFolder = childRequest["shapefilepath"]
            dissolvemupolygon= childRequest["dissolvemupolygon"]
            shapefiles = childRequest["shapefiles"] 
            #print(f'areasymbol: {areasymbol}')

            (status, isGeopackageTrue, errormessage) = dataloader.isGeopackage(db_path)
            if not status:
                (status, "Unable to connect to database.", errormessage, False)
            elif isGeopackageTrue:
                db_format = 'GPKG'
            else:   
                db_format = 'SQLite'

            #(status, conn, errormessage) = DlUtilities.create_connection(db_path)
            #if not status:
            #    return  (status, "Error encountered.", errormessage, False)
            #cursor = conn.cursor()        
            #cursor.execute("SELECT daglevel,tabphyname,iefilename,tabletype from mdstattabs where tabletype in ('Spatial') order by daglevel")
            #tblist = cursor.fetchall()
        
            #conn.close()
                                
            for tablename in shapefiles.keys():
                shapefileName = shapefiles[tablename]
                (status, message, errormessage)=dataloader.loadShapefileData(tablename, shapefileFolder, shapefileName, db_path, db_format, dissolvemupolygon)
                if not status:
                    return (status, "Error loading spatial data", errormessage, False)

            return (status, "", "", True)
        
        except Exception as ex:
            errormessage = f"Error while executing function loadAllShapefiles, Unexcepted error: {format(ex)}"
            tlogger.critical(errormessage)
            tlogger.critical(traceback.format_exc())
            return (False, "", errormessage, False)
    

    def initiateSpatialDataImport(loadspatialdatawithinsubprocess: bool, ssurgoDownloadRoot: str, ssurgoSource: bool, areasym, 
                                  database: str, requestSubfolder: str, dissolvemupolygon: bool) -> Tuple[bool, str, str, bool]:
        # Usage:
        #   (status, message, errormessage, allimported) = 
        #       dataloader.initiateSpatialDataImport 
        #           (loadspatialdatawithinsubprocess, ssurgoDownloadRoot, areasym, database, requestSubfolder, dissolvemupolygon)

        try:
            shapefiles = {}
            (status, conn, errormessage) = DlUtilities.create_connection(database)
            if not status:
                return  (status, "Error encountered.", errormessage, False)
            if ssurgoSource != 'statsGo': 
                cursor = conn.cursor()
                updtsapdag  = "update mdstattabs set daglevel = ((select daglevel from mdstattabs where tabphyname = 'mupolygon')+1) WHERE tabphyname = 'sapolygon' ;"       
                cursor.execute(updtsapdag)
                conn.commit()
                cursor.execute("SELECT tabphyname,iefilename, iefilenameaoi from mdstattabs where tabletype in ('Spatial') order by daglevel")
                tblist = cursor.fetchall()
                conn.close()

            shapefilepath = path.join(ssurgoDownloadRoot, 'spatial')

            if ssurgoSource not in ('customSSurgo','statsGo'):
                for rw in tblist:
                    sptbname  = str(rw[0])
                    spfilename= str(rw[1]) + "_" + areasym
                    shapefiles[sptbname] = spfilename
            elif ssurgoSource == 'customSSurgo':
                for rw in tblist:
                    sptbname  = str(rw[0])
                    spfilename= str(rw[2])
                    shapefiles[sptbname] = spfilename
            else:                        
                statsgo_regex = '^gsmsoilmu_a_[a-z][a-z].shp$'   #
                shapefiles['mupolygon'] = DlUtilities.getRegexMatches(shapefilepath, statsgo_regex)[0][:-4] 
                shapefiles['sapolygon'] = 'statsGo_sapolygon' # Temporary measure to add step for inserting to sapolygon
                if status:
                    ssurgoSource = 'statsGo'
                

            childRequest = {
                "request": "importspatialdata",
                "database": database,
                "shapefilepath": shapefilepath,
                "dissolvemupolygon": dissolvemupolygon,
                "shapefiles": shapefiles,
                "verbose":True
            }

            (status, response, error) = dataloader.importtabularinspatialdata(database, ssurgoDownloadRoot, ssurgoSource, areasym)
            if not status:
                return(status, response, error, False)
            #(status, response) = dataloader.loadAllShapefiles(ssurgoDownloadRoot, db_path, db_format, ssa)
            if loadspatialdatawithinsubprocess:
                # case: use a child process to load
                # Form the command vector and push in the request via stdin
                cmd = [
                    sys.argv[0],    # Path to the Python script
                    '@'             # Input should come from the STDIN channel    
                ]
                showVerboseMessage = True
                requestString = json.dumps(childRequest)
                (status, message) = RunChild.runSub(cmd, showVerboseMessage, stdinString=requestString)

                if status:
                    return  (status, message, "", True)
                else:
                    return  (status, "Error encountered.", message, False)
            else:
                # case: load in the current process
                (status, message, errormessage, allimported) = \
                    dataloader.loadAllShapefiles(childRequest)
                return (status, message, errormessage, allimported)
        
        except sqlite3.Error as error:
            return (False, "", 
                f"Error while executing function initiateSpatialDataImport for folder {requestSubfolder}, Unexcepted error: {format(error)}",
                False)
        
        except Exception as ex:
            errormessage = f"Error while executing function initiateSpatialDataImport for folder {requestSubfolder}, Unexcepted error: {format(ex)}"
            tlogger.critical(errormessage)
            tlogger.critical(traceback.format_exc())
            return (False, "", errormessage, False)


    def importspatialdata(request):
        (status, message, errormessage, allimported) = dataloader.loadAllShapefiles(request)  
        response = {
            "status": status,
            "message": message,
            "errormessage": errormessage,
            "allimported":allimported
        }
        return response    
    
    #Commented out until the issue of Bottle not allowing multiple threads is resolved.
    # def bulkDownload(request):
    #    (status, message, errormessage, allimported) = dataloader.loadAllShapefiles(request)  
    #    response = {
    #        "status": status,
    #        "message": message,
    #        "errormessage": errormessage,
    #        "allimported":allimported
    #    }
    #    return response

    def getDistanceSquared(x: float, y: float, originX: int, originY: int) -> float:
        # Return the cartesian distance-squared of (x,y) from an origin.
        # Used for ordering surevey area centroids
        distanceSquared = pow(x - originX, 2) + pow(y - originY, 2)
        return distanceSquared


    def getChildDistanceSquaredAndMbr(database: str, root: str, subfolder: str, 
                                      ssurgoSource: str, ssaName: str) -> Tuple[bool, str, float, float, float, float]:
        # Return the distanceSquared and MBR of the survey area's centroid from the sapolygon shapefile.
        # Usage: (status,errormessage,distanceSquared, minX, maxX, minY, maxY) = dataloader.getChildDistanceSquaredAndMbr(request["root"], originalSubfolder, areasym)
        try:
            #filename = f'soilsa_a_{ssaName}.shp'     
            (status, tbcon, errormessage) = DlUtilities.create_connection(database)
            if not status:
                return  (None, None, None, None, None)
            cursor = tbcon.cursor()
            cursor.execute( "SELECT iefilename,iefilenameaoi from mdstattabs where tabphyname in ('sapolygon')" )
            tblist = cursor.fetchall()
            driver = ogr.GetDriverByName('ESRI Shapefile')
            distanceSquared = 0

            if ssurgoSource == 'statsGo':
                tblist = [('^gsmsoilmu_a_[a-z][a-z].shp$')]   

            for rw in tblist:
                if ssurgoSource not in ('customSSurgo','statsGo'):
                    spfilename = str(rw[0]) + "_" + ssaName + ".shp"
                elif ssurgoSource == 'statsGo':
                    shapefileFolder = os.path.join(root, subfolder, 'spatial')
                    spfilename = DlUtilities.getRegexMatches(shapefileFolder, rw)[0]                
                else:
                    spfilename = str(rw[1]) + ".shp"
                shapefilepath = path.join(root, subfolder, "spatial", spfilename)
                if not os.path.isfile(shapefilepath):
                    return (None, None, None, None, None)
                dataSource = driver.Open(shapefilepath, 0)
                layer = dataSource.GetLayer()
                originX = -180
                originY = 90

                compositeEnvelope = []
                # The envelope is a 4-tuple: (minX, maxX, minY, maxY)
                for feature in layer:
                    geom = feature.GetGeometryRef()
                    envelope = list(geom.GetEnvelope())
                    #compositeEnvelope.add(geom.GetEnvelope())
                    if not compositeEnvelope: 
                       compositeEnvelope = envelope
                    else:
                        compositeEnvelope[0] = min(compositeEnvelope[0], envelope[0])
                        compositeEnvelope[1] = max(compositeEnvelope[1], envelope[1])
                        compositeEnvelope[2] = min(compositeEnvelope[2], envelope[2])
                        compositeEnvelope[3] = max(compositeEnvelope[3], envelope[3])
                averageX = (compositeEnvelope[0] + compositeEnvelope[1]) / 2
                averageY = (compositeEnvelope[2] + compositeEnvelope[3]) / 2                
                distanceSquared = dataloader.getDistanceSquared(averageX, averageY, originX, originY)               

            return (True,"",distanceSquared, compositeEnvelope[0], compositeEnvelope[1], compositeEnvelope[2], compositeEnvelope[3])
        
        except Exception as ex:
            errormessage = f"Error while executing getChildDistanceSquaredAndMbr function in {subfolder}, Unexcepted error: {format(ex)}"
            tlogger.critical(errormessage)
            tlogger.critical(traceback.format_exc())
            return (False,errormessage,None, None, None, None, None)


    def getSpatialSummary(request, getMbr: bool, cdict) -> Tuple[bool, str, list, float, float, float, float]:
        # Given the request with a list of subfolders, 
        # returns a subfolder list (cloned from the request)
        # with distance-squared from a NW origin and MBR for each.
        # We don't do much of this if istabularonly is true
        # or if loadinspatialorder is false.
        # Note: WSS SSA is assumed
        # Usage: (status, errormessage, sortedSubfolders, minXaggregated, maxXaggregated, minYaggregated, maxYaggregated) = (request, getMbr, cdict)
        # Note that if a new list is not required the old list is preserved.

        istabularonly = request["istabularonly"]
        if "loadinspatialorder" in request:
            performSort = request["loadinspatialorder"]
        else:
            performSort = True      
            
        database = request["database"]
        root = request["root"]

        # Short circuit: if no spatial data are involved, return the 
        # folder list as-is.
        # Additionally, if an MBR is not needed and sort order is not required,
        # we can also return early
        if istabularonly or (not getMbr and not performSort):
            return (True, "", request["subfolders"], None, None, None, None)
        
        # We are dealing with spatial data and either MBR or sorting 
        # is required.
        # The sort order will be represented by a list of 
        # the square of the distance from a northwest origin to the 
        # centroid of each sapolygon.
        isFirst = True
        distancesSquared = []
        for originalSubfolder in request["subfolders"]:
            # As required we'll accumulate an aggregated mBR and 
            # a vector of squared distances.
            areasymbols = cdict[originalSubfolder]

            ssurgoSource = 'standardSSurgo'
            saaoifilename = 'aoi_a_aoi.shp'   #
            saaoifilepath = path.join(root, originalSubfolder, 'spatial', saaoifilename)  #
            
            (status, errormessage) = DlUtilities.testFileExists(saaoifilepath, f"Error in {saaoifilepath}") #
            if status:
                ssurgoSource = 'customSSurgo'   #

            if ssurgoSource != 'customSSurgo':
                statsgo_regex = '^gsmsoilmu_a_[a-z][a-z].shp$'   #
                statsgofilepath = path.join(root, originalSubfolder, 'spatial')  #
                (status, errormessage) = DlUtilities.testFileExists(statsgofilepath, f"Error in {statsgofilepath}", regex=statsgo_regex) #
                if status:
                    ssurgoSource = 'statsGo'  
        
            areasym = list(areasymbols.keys())[0].lower()

            if isFirst:
                (status, errormessage,  distanceSquared, minXaggregated, maxXaggregated, minYaggregated, maxYaggregated) = \
                    dataloader.getChildDistanceSquaredAndMbr(database,root,originalSubfolder, ssurgoSource, areasym)
                if not status:
                    return (False, errormessage, None, None, None, None, None) 

                distancesSquared.append(distanceSquared)
                isFirst = False
            else:
                (status, errormessage, distanceSquared, minX, maxX, minY, maxY) = \
                    dataloader.getChildDistanceSquaredAndMbr(database,root,originalSubfolder, ssurgoSource, areasym)
                if not status:
                    return (False, errormessage, None, None, None, None, None) 

                distancesSquared.append(distanceSquared)
                if getMbr:
                    minXaggregated = min(minXaggregated, minX)
                    maxXaggregated = max(maxXaggregated, maxX)
                    minYaggregated = min(minYaggregated, minY)
                    maxYaggregated = max(maxYaggregated, maxY)
        
        if performSort:
            # Return a new sorted list if required.
            # The MBR values can be ignored.
            sortedFolders = [i for _,i in sorted(zip(distancesSquared,request["subfolders"]))]
            return (True, "", sortedFolders, minXaggregated, maxXaggregated, minYaggregated, maxYaggregated)    
        else:
            # Only the MBR is required, return the original list,
            return (True, "", request["subfolders"], minXaggregated, maxXaggregated, minYaggregated, maxYaggregated)
    

    def updateGeopackageMbr(database: str, minXaggregated: float, maxXaggregated: float, 
                            minYaggregated: float, maxYaggregated: float) -> Tuple[bool, str]:
        # Given a GeoPackage and not a tabular-only import,
        # update the MBR for all tables in the database.
        # Usage: (status, errormessage) = (updateGeopackageMbr...)

        # Use the stored sapolygon's max_y < 180 as a proxy for an initialized database.
        # We only want one row.
        checkSql = \
            "select min_x, min_y, max_x, max_y " \
            + "from gpkg_contents where table_name = 'sapolygon';"
        (status, conn, errormessage) = DlUtilities.create_connection(database)
        if not status:
            return (status, errormessage)
        cur = conn.cursor()
        cur.execute(checkSql)
        (min_x, min_y, max_x, max_y) = cur.fetchall()[0]

        updateSql = "update gpkg_contents set min_x=?, min_y=?, max_x=?, max_y=?;"
            
        initializedSql = "select exists (select 1 from sapolygon) as 'isinitialized'"        
        cur = conn.cursor()
        cur.execute(initializedSql)
        isinitialized= cur.fetchone()
        isinitialized = bool(isinitialized[0])
        if isinitialized:
            # Case: initialized database, determine updated values
            min_x = min(min_x, minXaggregated)
            min_y = min(min_y, minYaggregated)
            max_x = max(max_x, maxXaggregated)
            max_y = max(max_y, maxYaggregated)           
        else:
            # Case: initialized database, replace all values
            min_x = minXaggregated
            min_y = minYaggregated
            max_x = maxXaggregated
            max_y = maxYaggregated

        cur.execute(updateSql, (min_x, min_y, max_x, max_y))
        conn.commit()
        conn.close()

        return (True, "")


    def importCandidates(request):
        # Use case 5b request: importCandidates
        # Use case 5: "Import one or more SSAs into an ET from a set of subfolders 
        # that I choose under a containing folder that I specify."
        # Import one or more SSAs into a SSURGO SQLite database from a set of
        # subfolders that I choose under a root folder.

        #response = {"status":True, "allimported": False, "message":"", "errormessage":"", "subfolders":[]}
        response = {}
        root = request["root"]
        subfolders = request["subfolders"]
        (status, errormessage) = DlUtilities.testFolderExists(root, 'Error in "root"')
        for folder in subfolders:
           (status, errormessage) = DlUtilities.testFolderExists("{}/{}".format(root, folder), 'This SSURGO Folder')
        if not status: return { "status": status, "errormessage": errormessage}
        database = request["database"]
        (status, errormessage) = DlUtilities.testFileExists(database, 'Error in "database"')
        if not status: return { "status": status, "errormessage": errormessage}

        requestSubfolders = request["subfolders"]

        istabularonly = request["istabularonly"]
        skippretest = request["skippretest"]

        if "includeinterpretationsubrules" in request:
            IncludeInterpretationSubRules = request["includeinterpretationsubrules"]
        else:
            IncludeInterpretationSubRules = False
        
        subfolders = []
        cdict = {}
        
        dataloader.setcsvfieldsizelimit()

        if skippretest:     #skippretest is always True when DP sends the rqeuest. It could be True\False in case of DL
            for subfolder in requestSubfolders:
                (status, message, errormessage, areasymbols) = dataloader.getSacatalogData(database, root, subfolder, False)
                if status:          
                    cdict[subfolder] = areasymbols
                else:
                    subfolders.append({"childfoldername": subfolder, "elapsedsecondstabularimport":0, "elapsedsecondsspatialimport":0,"areasymbols":areasymbols})
                    response = {
                        "allimported":status,
                        "status":status,
                        "message": message,
                        "errormessage":errormessage,
                        "subfolders": subfolder
                        }
                    return response

        else:
            pretestresponse = dataloader.pretestImportCandidates(request)
            if not pretestresponse["allpassed"]:
                return pretestresponse
            else:
                for children in pretestresponse["subfolders"]:
                    cdict[children["childfoldername"]] = children["areasymbols"]

        
        # Do we perform the mupolygon dissolve on mukey value?
        dissolvemupolygon               = request["dissolvemupolygon"]
        loadspatialdatawithinsubprocess = request["loadspatialdatawithinsubprocess"]
        # SORT POINT - if needed, reorder subfolders by spatial ordering
        # before iterating through them.
        # We also have an MBR that can be used to update a GeoPackage
        (status, isGeopackageTrue, errormessage) = dataloader.isGeopackage(database)
        
        if not status:
            response["message"] = "Unable to connect to database."
            response["errormessage"] = errormessage
            response["status"] = False
            return response
        
        getMbr = (isGeopackageTrue and not istabularonly)
        (status, errormessage, sortedSubfolders, minXaggregated, maxXaggregated, minYaggregated, maxYaggregated) = \
            dataloader.getSpatialSummary(request, getMbr, cdict)
        if not status:
            response["errormessage"] = errormessage
            response["status"] = False
            return response
        if getMbr:
            dataloader.updateGeopackageMbr(database, minXaggregated, maxXaggregated, minYaggregated, maxYaggregated)

    
        # Import candidates into specified database
        subfolders = []

        for requestSubfolder in sortedSubfolders:

            time_elapsed_tabular=0
            time_elapsed_spatial=0

            tlogger.debug(f'Starting import of subfolder {requestSubfolder}')

            (status, message, errormessage, areasymbols) = dataloader.getSacatalogData(database, root, requestSubfolder, False)
            if not status:
                subfolders.append({"childfoldername": requestSubfolder,"elapsedsecondstabularimport": time_elapsed_tabular , "elapsedsecondsspatialimport":time_elapsed_spatial, "errormessage":errormessage, "areasymbols":areasymbols})
                response = {
                    "allimported":status,
                    "status": status,
                    "message":message,
                    "errormessage": errormessage,                  
                    "subfolders": subfolders
                    }
                return response 
            else:
                (status, connection, errormessage) = DlUtilities.create_connection(database)
                if not status:
                    subfolders.append({"childfoldername": requestSubfolder,"elapsedsecondstabularimport": time_elapsed_tabular , "elapsedsecondsspatialimport":time_elapsed_spatial, "errormessage":errormessage, "areasymbols":areasymbols})
                    response = {
                        "allimported":status,
                        "status": status,
                        "message":message,
                        "errormessage": errormessage,        
                        "subfolders": subfolders
                        }
                    if connection: connection.close()
                    return response 
                for areasymbol in areasymbols:
                    (status, message, errormessage) = DlUtilities.deleteAreasymbol(database, areasymbol, connection)
                    if not status:
                        response = {
                            "allimported":status,
                            "status": status,
                            "message":message,
                            "errormessage": errormessage,                  
                            "subfolders": subfolders
                            }
                        if connection: connection.close()
                        return response
                if connection: connection.close()

            ssurgoDownloadRoot = os.path.join(root, requestSubfolder) 
            ssurgoSource = 'standardSSurgo'
            saaoifilename = 'aoi_a_aoi.shp'   #
            saaoifilepath = path.join(ssurgoDownloadRoot, 'spatial', saaoifilename)  #
            
            (status, errormessage) = DlUtilities.testFileExists(saaoifilepath, f"Error in {saaoifilepath}") #
            if status:
                ssurgoSource = 'customSSurgo'   #

            if ssurgoSource != 'customSSurgo':
                statsgo_regex = '^gsmsoilmu_a_[a-z][a-z].shp$'   #
                statsgofilepath = path.join(ssurgoDownloadRoot, 'spatial')  #
                (status, errormessage) = DlUtilities.testFileExists(statsgofilepath, f"Error in {statsgofilepath}", regex=statsgo_regex) #
                if status:
                    ssurgoSource = 'statsGo'            
        
            areasym = list(areasymbols.keys())[0].lower()

            start_time_tabular = time.time()
            (status, message, errormessage)= dataloader.importtabulardata (database, ssurgoDownloadRoot, IncludeInterpretationSubRules)
            end_time_tabular = time.time()
            time_elapsed_tabular = round(end_time_tabular - start_time_tabular)
 
            #(status, message, error)= dataloader.importtabulardatausingpandas (database, ssurgoDownloadRoot)

            if not status:
                subfolders.append({"childfoldername": requestSubfolder,"elapsedsecondstabularimport": time_elapsed_tabular , "elapsedsecondsspatialimport":time_elapsed_spatial, "errormessage":errormessage, "areasymbols":areasymbols})

                message = "Tabular import failed. Please check errormessage"
                response = {
                    "allimported":status,
                    "status": status,
                    "message":message,
                    "errormessage": errormessage,                  
                    "subfolders": subfolders
                }
                return response  

            if not istabularonly:
                start_time_spatial = time.time()
                #(status, message, errormessage) = dataloader.importspatialdata (database, ssurgoDownloadRoot, areasym, loadspatialdatawithinsubprocess, dissolvemupolygon)
                (status, message, errormessage, allimporrted) = \
                    dataloader.initiateSpatialDataImport (loadspatialdatawithinsubprocess, ssurgoDownloadRoot, ssurgoSource, areasym, database, requestSubfolder, dissolvemupolygon)
                end_time_spatial = time.time()
                time_elapsed_spatial = round(end_time_spatial - start_time_spatial)
                if not status:
                    subfolders.append({"childfoldername": requestSubfolder,"elapsedsecondstabularimport": time_elapsed_tabular , "elapsedsecondsspatialimport":time_elapsed_spatial, "errormessage":errormessage, "areasymbols":areasymbols})

                    message = "Spatial import failed. Please check errormessage"
                    response = {
                        "allimported":status,
                        "status": status,
                        "message":message,
                        "errormessage": errormessage,                  
                        "subfolders": subfolders
                    }
                    return response 
                
            subfolders.append({"childfoldername": requestSubfolder,"elapsedsecondstabularimport": time_elapsed_tabular , "elapsedsecondsspatialimport":time_elapsed_spatial, "errormessage":errormessage, "areasymbols":areasymbols})

        # We have finished iterating through the import folders.
        # We need to perform housekeeping and remove sdvfolderattribute and sdvfolder records.
        # Remove parent table records 
        (status, connection, errormessage) = DlUtilities.create_connection(database)
        if not status:
            response = {
                "allimported":False,
                "status": status,
                "message":message,
                "errormessage": errormessage,        
                "subfolders": subfolders
                }
            if connection: connection.close()
            return response                 
        else:
            sqlRemoveFArecords = 'DELETE FROM sdvfolderattribute WHERE attributekey NOT IN (SELECT attributekey FROM sdvattribute)'
            connection.execute(sqlRemoveFArecords)
            connection.commit()
            sqlRemoveFrecords = 'DELETE FROM sdvfolder WHERE folderkey NOT IN (SELECT folderkey FROM sdvfolderattribute)'
            connection.execute(sqlRemoveFrecords)
            connection.commit()
            connection.close()
            tlogger.debug('SDV* housekeeping: finished')
    
        response = {
                "allimported":True,
                "status": True,
                "message":"SSURGO data import succeeded",
                "errormessage":"",                  
                "subfolders":subfolders
                }
        
        return response

    def calculateStatistics(rasterfilepath, src_ds, srcband):
        try:
            #is approximate calculation okay (BOOL: default=False), force recalculation if stats already exist (BOOL: default=False)
            #Rtns list: Min, Max, Mean, StdDev
            stats = srcband.GetStatistics(False,True)

            #GetStatistics wasn't writing the .aux.xml stats file immediately. so I added this.
            #Not too far down, there is code to modify the stats  
            src_ds.FlushCache()

            #gdal.org/doxygen/classGDALRasterBand.html#aa21dcb3609bff012e8f217ebb7c81953
            #approx_ok defaults to True and ends up only taking a very small sample.
            #bins dafaults to 256, which is what I want
            #In my test dataset, the first bin had the largest count by far. I was first suspicious that NoData (0) wasn't being excluded,
            #but it is. Turns out that a lot of map units fall into the first bin.
            histogram = srcband.GetHistogram(min=stats[0], max=stats[1], approx_ok=False)

            #open the statistics file that GetStatistics creates automatickely 
            meta_tree = ET.parse(rasterfilepath+'.aux.xml')
            xml_root = meta_tree.getroot()

            # Add the metadata domain="Esri"
            ESRI_metadata = ET.Element("Metadata", domain="Esri")
            xml_root.insert(0, ESRI_metadata)
            ET.SubElement(ESRI_metadata, "MDI", key="PyramidResamplingType").text = "NEAREST"

            # Create the <Histograms> block
            histograms = ET.Element("Histograms")
            hist_item = ET.SubElement(histograms, "HistItem")
            ET.SubElement(hist_item, 'HistMin').text = str(int(stats[0]))
            ET.SubElement(hist_item, 'HistMax').text = str(int(stats[1]))
            ET.SubElement(hist_item, 'BucketCount').text = '256'
            ET.SubElement(hist_item, 'IncludeOutOfRange').text = '1'        #Excludes 0 (which has been the nodata value up to this point)
            ET.SubElement(hist_item, 'Approximate').text = '0'              #I did specify True for approximate in GetStatistics()
            ET.SubElement(hist_item, 'HistCounts').text = ' | '.join(map(str,histogram))

            pam_band = xml_root.find("PAMRasterBand")
            pam_band.insert(0, histograms) #pam_band.append(histograms) adds new item only to the bottom

            xmlpath = rasterfilepath+'.aux.xml'
            meta_tree.write(xmlpath)
        except Exception as e:
            tlogger.warning(f"Error calculating statistics for {os.path.basename(rasterfilepath)}: {e}")
            tlogger.warning(traceback.format_exc())
            return (False, str(e))  #Not sure if I can get away will casting any error object to a string.
        
        return (True, os.path.basename(xmlpath))
    
    def buildPyramids(rasterfilepath, src_ds):
        try:
            geo_trans = src_ds.GetGeoTransform()
            raster_width = src_ds.RasterXSize
            raster_height = src_ds.RasterYSize
            raster_area = raster_width * raster_height * geo_trans[1] * abs(geo_trans[5])
            #print(str(raster_width) + " * " + str(raster_height) + " * " + str(geo_trans[1]) + " * " + str(abs(geo_trans[5])) + " = " + str(raster_area))   ###diag
            
            #BuildOverviews("NEAREST", [2,4,8], resampling="nearest", tilesize=512)
            gdal.SetConfigOption('COMPRESS_OVERVIEW', 'DEFLATE')
            if raster_width > 1024 and raster_height > 1024:
                if raster_area < 10000000000:
                    src_ds.BuildOverviews("NEAREST", [2,4,8,16,32])
                elif raster_area < 1000000000000:
                    src_ds.BuildOverviews("NEAREST", [2,4,8,16,32,64,128])
                else:
                    src_ds.BuildOverviews("NEAREST", [2,4,8,16,32,64,128,256])
        except Exception as e:
            tlogger.warning(f"Error building pyramids for {os.path.basename(rasterfilepath)}: {e}")
            tlogger.warning(traceback.format_exc())
            return (False, str(e))
        
        return (True, os.path.basename(rasterfilepath)+'.ovr')

    def generateRAT(rasterfilepath, src_ds, srcband):
        try:
            blk_width, blk_height = srcband.GetBlockSize()
            mupoly_cnts = {}
            for y in range(0, src_ds.RasterYSize, blk_height):
                for x in range(0, src_ds.RasterXSize, blk_width):
                    # Read block
                    block_array = srcband.ReadAsArray(x, y, blk_width, blk_height)

                    # Get unique values in the block
                    unique_values, counts = np.unique(block_array, return_counts=True)

                    # Update the dictionary with counts
                    for value, count in zip(unique_values, counts):
                        if value not in mupoly_cnts:
                            mupoly_cnts[value] = count
                        else:
                            mupoly_cnts[value] += count
            
            #I tried tons of different ways, but dbf.Table will only open an existing table, so I create a .dbf like this first.
            p=open(rasterfilepath+'.vat.dbf',"w")
            p.close()
            
            #1. To make it compatible with older DBF formats, dbf casts column names to all uppercase. Came across case_sensitive=True parameter, but dbf doesn't recognize it.
            #2. on_disk=True (default) => frequent writes. on_disk=False => table only exists in memory.
            #   320,000 mukeys in CONUS => ~3.5 MB RAT, so no need for optimization.
            dbf_tbl = dbf.Table(rasterfilepath+'.vat.dbf', field_specs='Value N(10, 0); Count N(10, 0); MUKEY N(10, 0)', codepage="utf8")
            dbf_tbl.open(dbf.READ_WRITE)
            
            for val, cnt in mupoly_cnts.items():
                if val != 0:
                    dbf_tbl.append((val, cnt, val))
            dbf_tbl.close()

            #ESRI wants a file that states what character encoding was used
            with open(rasterfilepath+'.vat.cpg','w') as cpg_file:
                cpg_file.write('UTf-8')   

        except Exception as e:
            tlogger.warning(f"Error generating RAT for {os.path.basename(rasterfilepath)}: {e}")
            tlogger.warning(traceback.format_exc())
            return (False, str(e))
        
        return (True, os.path.basename(rasterfilepath)+'.dbf')

    def generateRasters(request):

        # tbd validate input paths
        root = request["root"]
        (status, errormessage) = DlUtilities.testFolderExists(root, 'Error in "root"')
        if not status: return { "status": status, "errormessage": errormessage}
        database = request["database"]
        (status, errormessage) = DlUtilities.testFileExists(database, 'Error in "database"')
        if not status: return { "status": status, "errormessage": errormessage}

        rasterResolution = request["rasterresolution"]
        buildpyramids = request["buildpyramids"]
        generateRAT = request["generateRAT"]
        calculatestats = request["calculatestats"]
        deleteExistingRasters = request["deleteexistingrasters"]
        
        #Write to warn users if they try to 
        #import psutil
        #from psutil._common import bytes2human
        #avail_mem = psutil.virtual_memory().available
        #print(f"Available Memory: {bytes2human(avail_mem)}")
        #use psutil.disk_usage() to confirm that there is enough storage space.

        if deleteExistingRasters:
            for file in listdir(root):
                filename = str(file)
                currentFile = path.join(root, filename)
                if ".tif" in filename:
                    remove(currentFile)
        
        proj_zones = intersectingZones()
    
        # rasterResolution work is still undercooked
        if rasterResolution > 0:
                
            #Can I rely on this flag 100%?
            (status, isGeopackageTrue, errormessage) = dataloader.isGeopackage(database)
            if not status:
                response = {
                            "allgenerated":status,
                            "status":status,
                            "message": "Unable to connect to database.",
                            "errormessage":errormessage
                            }
                return response

            if isGeopackageTrue: #alternative is if database.endswith('.gpkg'):
                driverName = 'GPKG'
            else:
                driverName = 'SQLite'
            
            try:
                inpDriver = ogr.GetDriverByName(driverName)
                inpSrc = inpDriver.Open(database, 1) #0=read only, 1 needed to write acre field.
                inpLyr = inpSrc.GetLayerByName("mupolygon")            
                input_srs = inpLyr.GetSpatialRef()
                totfeatcnt = inpLyr.GetFeatureCount()
                #There is GetExtent and GetEnvelope which seem identical: https://gdal.org/api/python/osgeo.ogr.html
                extent = inpLyr.GetExtent()
            except Exception as ex:
                errormessage = f"Error collecting vector dataset properties in {database}, Unexcepted error: {format(ex)}"
                tlogger.critical(errormessage)
                tlogger.critical(traceback.format_exc())
                response = {
                            "allgenerated":False,
                            "status":False,
                            "message": "Unable to collect vector dataset properties",
                            "errormessage":errormessage
                            }
                return response

            #follow example on https://stackoverflow.com/questions/47183923/adding-progress-bar-to-gdal-warp
            #and https://gis.stackexchange.com/questions/237479/using-callback-with-python-gdal-rasterizelayer
            progress_percent = 0
            def callback(complete, msg, unknown):
                nonlocal progress_percent
                progress_percent = int(complete * 100)
                progMsg = "Rasterize Progress: " + str(progress_percent) + "%"
                print(progMsg, end="\r")
                #print(f"Progress: {progress_percent}%", end="\r")
                tlogger.info(progMsg)
            
            in_zones = list()

            # #Sadly, you have to recreate the extent to pass it to Intersects
            # #If the .gpkg includes SSA's on both sides of the IDL, then a two part polygon needs to be created
            # if extent[0] < 0 and extent[1] > 0:
            #     wkt = f'MULTIPOLYGON((({extent[0]} {extent[2]},-64 {extent[2]},-64 {extent[3]},{extent[0]} {extent[3]},{extent[0]} {extent[2]})),((130 {extent[2]},{extent[1]} {extent[2]},{extent[1]} {extent[3]},130 {extent[3]},130 {extent[2]})))'
            # else:
            #     wkt = f'MULTIPOLYGON((({extent[0]} {extent[2]},{extent[1]} {extent[2]},{extent[1]} {extent[3]},{extent[0]} {extent[3]},{extent[0]} {extent[2]})))'
            # new_polygon = ogr.CreateGeometryFromWkt(wkt)

            # output_srs = osr.SpatialReference()

            # #This block identifies which coordinate system "zones" (_bbox list above) intersect with the SSURGO Template database extent
            # in_zones = []
            # for i in range(0,len(proj_zones)):
            #     if proj_zones[i][0].Intersects(new_polygon):
            #         in_zones.append(i)
            #     elif proj_zones[i][0].Intersects(new_polygon) != False:
            #         #Intersects can return things like OGRERR_NOT_ENOUGH_DATA, OGRERR_CORRUPT_DATA, etc
            #         errortype = proj_zones[i][0].Intersects(new_polygon)
            #         tlogger.critical("Coordinate System Zone test error")
            #         response = {
            #             "allgenerated":False,
            #             "status":False,
            #             "message": "Coordinate System Zone test error",
            #             "errormessage": errortype
            #         }
            #         return response
            #         #Still need to abort/roll bac

            print("SSA and Zone Spatial Intersect Query against database...")

            # this loop could use some additional improvement
            for feature_index_count, feat in enumerate(inpLyr):

                #This block identifies which coordinate system "zones" (_bbox list above) intersect with the SSURGO Template database extent
                for i in range(0,len(proj_zones)):
                    tmp_item = [feat.GetField("areasymbol"), i, proj_zones[i][2], "muraster_" + str(rasterResolution) + "m" + proj_zones[i][1] + ".tif"]
                    if tmp_item in in_zones:
                        break
                    # logic / intersections assumes that all SSAs are associated with a single SRS/projection bbox
                    # if this isn't the case then there is a flaw in the proj_zones logic / object
                    elif proj_zones[i][0].Intersects(feat.GetGeometryRef()):
                        # duplicate projection area
                        if tmp_item[1:] in [sub_array[1:] for sub_array in in_zones][1:] or tmp_item[1:] in [sub_array[1:] for sub_array in in_zones]:
                            break
                        # output raster name should amount to something like "muraster_10m_alaska.tif"
                        # shared zones will be output together
                        in_zones.append(tmp_item)
                        # print output of projection zones associated with unique tif file generation
                        print(f"idx: {str(feature_index_count).zfill(5)} \tSSA: {feat.GetField('areasymbol')} \tSRS: {proj_zones[i][2]} \tProj Area: {proj_zones[i][1][1:]} ({i})")
                        break
                    continue

            if len(in_zones) == 0:
                response["message"] = "No SSAs intersected with any coordinate system zones"
                response["status"] = False
                return response
            
            del feature_index_count, i, tmp_item
            output_srs = osr.SpatialReference()
            reproject = True  #presume that vector data (EPSG:4326 will need to be projected - Pacific is only region that stays 4326)
            zoneCnt = 0  
            runFeatCnt = 0
            rasters = []
            #If SSAs are only in one zone, then a preprocessing step can be skipped. 
            only_one = True if len(set([arr[1] for arr in in_zones])) == 1 else False
            for zone_index in [sub_array[1:] for sub_array in in_zones]:
                zoneCnt += 1
                featCnt = 0
                #1 degree = 111,111 meters, so 0.00009 is roughly 10m at the equator.
                #Width decreases as latitude increases. The formula is width = height * cos(latitude)
                #Similarly, change in longitude in degrees = (change in meters)/(111,319.5cos(latitude))
                #Note the denominator is a little larger above because the planet is oblong.
                #I didn't bother with the complextity to calculate square pixels because the furtherest from the equator is 22 degrees north
                #At that latitude, the pixel width is only 6.6% shorter than the pixel hieght
                if zone_index[1] == 4326:           #No reprojection is needed
                    rasRes = round(rasterResolution/110574, 8)
                    reproject = False
                    output_srs.ImportFromEPSG(zone_index[1])
                    #If there are SSAs in more than one coordinate system zone, then code has to select the polygons that are in the current zone
                    if only_one == False:
                        mem_driver = ogr.GetDriverByName('MEMORY')
                        mem_ds = mem_driver.CreateDataSource('')

                        # Create a new layer in the data source
                        mupoly = mem_ds.CreateLayer('mupoly', srs=output_srs, geom_type=ogr.wkbPolygon)

                        # Duplicate the 'mukey' field
                        mukeyField = ogr.FieldDefn('MUKEY',ogr.OFTInteger)
                        mupoly.CreateField(mukeyField)

                        for feature in inpLyr:
                            geom = feature.GetGeometryRef()
                            if geom.Intersects(proj_zones[zone_index[0]][0]):
                                featCnt += 1
                                selected_feature = ogr.Feature(mupoly.GetLayerDefn())
                                selected_feature.SetGeometry(geom.Clone())
                                mukeyVal = feature.GetField('MUKEY')
                                selected_feature.SetField('MUKEY',mukeyVal)
                                mupoly.CreateFeature(selected_feature)
                    #else only_one == True, therefore no reprojection or sub-selecting of SSA polygons is required.
                #SSAs in coordinate system zones other than the Pacific (4326) need to be reprojected
                else:
                    rasRes = rasterResolution
                    output_srs.ImportFromEPSG(zone_index[1])

                    # Create the coordinate transformation object
                    coord_transformation = osr.CoordinateTransformation(input_srs, output_srs)

                    mem_driver = ogr.GetDriverByName('MEMORY')
                    mem_ds = mem_driver.CreateDataSource('')

                    # Create a new layer in the data source
                    mupoly = mem_ds.CreateLayer('mupoly', srs=output_srs, geom_type=ogr.wkbPolygon)

                    # Duplicate the 'mukey' field
                    mukeyField = ogr.FieldDefn('MUKEY',ogr.OFTInteger)
                    mupoly.CreateField(mukeyField)

                    # Loop through the features in the input layer and transform them
                    featCnt = 0
                    for feature in inpLyr:
                        # Get the geometry of the feature
                        geometry = feature.GetGeometryRef()
                        #If SSAs fall into multiple coordinate systems zones, select which polygons are in the current zone and reproject just those
                        #(proj_zones[zone_index][1] == 5070 and runFeatCnt == 0) is a short cut to avoid one situation.
                        #If database template contains SSA south of Corpus Cristi, TX (so very south of TX or FL), then the extent has the potential
                        #to overlap with the lonely little SSA in Mexico. Extra preprocessing time is avoided with this test.
                        if not only_one or (zone_index[1] == 5070 and runFeatCnt == 0):
                            if geometry.Intersects(proj_zones[zone_index[0]][0]):
                                featCnt += 1
                                geometry.Transform(coord_transformation)
                                muFeature = ogr.Feature(mupoly.GetLayerDefn())
                                muFeature.SetGeometry(geometry)
                                mukeyValue = feature.GetField('MUKEY')
                                muFeature.SetField('MUKEY',mukeyValue)
                                mupoly.CreateFeature(muFeature)
                            #else: polygon doesn't intersect, therefore ignore it
                        #Reproject all SSAs if they are all in just one coordinate system zone.
                        else:
                            featCnt += 1
                            # Transform the geometry to EPSG:5070
                            geometry.Transform(coord_transformation)

                            # Add transformed feature to mem output object
                            muFeature = ogr.Feature(mupoly.GetLayerDefn())
                            muFeature.SetGeometry(geometry)

                            mukeyValue = feature.GetField('MUKEY')
                            muFeature.SetField('MUKEY',mukeyValue)

                            mupoly.CreateFeature(muFeature)
                    #print(f"{raster_name} feature count = {featCnt}")
                    runFeatCnt += featCnt
                    # error checking disabled per current fix logic incompatible with current debug fix
                    # if zoneCnt == len(in_zones):
                    #     if runFeatCnt != inpLyr.GetFeatureCount():
                    #         errormessage = f"Feature count mismatch. {inpLyr.GetFeatureCount()} features, {runFeatCnt} processed."
                    #         tlogger.critical(errormessage)
                    #         response = {
                    #             "allgenerated":False,
                    #             "status":False,
                    #             "message": "Feature count mismatch",
                    #             "errormessage": errormessage
                    #         }
                    #         return response
                    #         print(f"{runFeatCnt} <> {inpLyr.GetFeatureCount()}")
                    #     else:
                    #         pass #no problem, so continue
                    #         print(f"{runFeatCnt} = {inpLyr.GetFeatureCount()}")
                    if featCnt == 0:
                        continue

                    
                #Extent
                if reproject or not only_one:
                    x_min, x_max, y_min, y_max = mupoly.GetExtent()
                else:
                    x_min, x_max, y_min, y_max = inpLyr.GetExtent()
                x_ncells = int((x_max - x_min) / rasRes)
                y_ncells = int((y_max - y_min) / rasRes)

                outDriver = gdal.GetDriverByName('GTiff')
                rasterfilepath = os.path.join(root, zone_index[2])
                #(filename, xsize, ysize, bands, data type, options) (For my CA011 test, 7512, 7168)
                #https://www.programcreek.com/python/example/101827/gdal.RasterizeLayer Example #6 says this is where options=['COMPRESS=LZW'] goes
                outRaster = outDriver.Create(rasterfilepath, x_ncells, y_ncells, 1, gdal.GDT_UInt32, options=['COMPRESS=DEFLATE','BIGTIFF=YES'])

                # Set the projection and geotransform of the output raster file
                #This is all that is needed to reproject!
                outRaster.SetProjection("EPSG:"+output_srs.GetAuthorityCode(None))
                #(upper-left X, pixel width, "rotation of the raster in the x-direction"???, 
                # upper-left Y, "rotation of the raster in the y-direction", pixel height)
                #Bing adds, "...define the rotation if your image doesn’t have ‘north up’. But most images are north up" - so 3rd = 5th = 0"
                #For the CA011 test: outRaster.SetGeoTransform((-2257376.8474279777146876, 10, 0, 2137895.9626914579421282, 0, -10))
                coord = x_min + rasRes/2
                coord_n = (coord // rasRes + round((coord % rasRes) / rasRes)) * rasRes
                x_min = coord_n - rasRes/2
                coord = y_max + rasRes/2
                coord_n = (coord // rasRes + round((coord % rasRes) / rasRes)) * rasRes
                y_max = coord_n - rasRes/2

                outRaster.SetGeoTransform((x_min, rasRes, 0, y_max, 0, -rasRes))
                outLyr = outRaster.GetRasterBand(1)     #There is only one band
                #need to make this a config value: raster_NoData=0
                outLyr.SetNoDataValue(0)

                rasterize_st = time.time()
                gdal.UseExceptions()
                # Rasterize the layer.
                #https://www.programcreek.com/python/example/101827/gdal.RasterizeLayer (Example #7)
                #Resample method is Nearest Neighbor by default, which is what I want.
                #It can be specified: options={'resampleAlg':'nearest | bilinear | cubic | average | mode'}
                #Note: options can be in a list or a dictionary (probably any iterable data format).
                #Another thing to be aware of is that some options are case sensitive (Like ATTRIBUTE) but others are not (like t_srs/T_SRS)
                if reproject or not only_one:
                    #For CONUS, Alaska, & PR/VI, mupoly is in a projected coordinate system with units in meters
                    gdal.RasterizeLayer(outRaster, [1], mupoly, options=['ATTRIBUTE=MUKEY'], callback=callback)
                    print("")   #diag - adds space after "progress"  
                else:
                    #For the Pacific islands, use the original vector dataset that is in WGS84 so the units are degrees
                    gdal.RasterizeLayer(outRaster, [1], inpLyr, options=['ATTRIBUTE=MUKEY'], callback=callback)
                    print("")   #diag - adds space after "progress" 
            
                mupoly = None
                outLyr = None
                # outRaster.FlushCache() # disabled until further evaluation
                outRaster = None
                rasterize_end = time.time()
                #print(f"{raster_name} Rasterize: {rasterize_end - rasterize_st})")

                postprocess_st = time.time()
                postprocessing = {}

                #If any of the postprocessing steps are required, the source raster data needs to be re-read in.
                if calculatestats or buildpyramids or generateRAT:
                    (status, errormessage) = DlUtilities.testFileExists(rasterfilepath, f"Error in {rasterfilepath}")
                    if not status:
                        response = {
                            "status": status,
                            "errormessage": errormessage 
                        }
                        return response
                    
                    #I have to reopen the raster rather than reuse outRaster because, for outRaster, I can't find a way to
                    #specify gdal.GA_ReadOnly, which is necessary for the postprocessing steps to generate external files
                    #instead of adding the results inside the GeoTiff.
                    #Ex: gdal.GA_Update (default) => Internal Stats, gdal.GA_ReadOnly => External Stats (.aux.xml file)
                    src_ds = gdal.Open(rasterfilepath, gdal.GA_ReadOnly)

                    #Band data needs to be re-read for either/both of these postprocessing steps
                    if calculatestats or generateRAT:
                        srcband = src_ds.GetRasterBand(1)

                #each set => (boolean re: will postprocessing step run, string re: corresponding response tag name)
                for step in [(calculatestats, "statistics"), (buildpyramids, "pyramids"), (generateRAT, "rasterattrtable")]:
                    if step[0]:
                        tlogger.info(f"Processing: {step[1]}")
                        if step[1] == "statistics":
                            print("Calculating Statistics")       #Add print statement to provide some guidance to user
                            results = dataloader.calculateStatistics(rasterfilepath, src_ds, srcband)
                        elif step[1] == "pyramids":
                            print("Building Pyramids")
                            results = dataloader.buildPyramids(rasterfilepath, src_ds)
                        elif step[1] == "rasterattrtable":
                            print("Generating Raster Attribute Table")
                            results = dataloader.generateRAT(rasterfilepath, src_ds, srcband)
                        else:
                            tlogger.warning("Invalid postprocessing step.")

                        #Will be 1. name of resulting output file, or 2. error message
                        postprocessing[step[1]] = results[1]
                    else:
                        tlogger.info(f"Skipping: {step[1]}")
                        postprocessing[step[1]] = "skipped"

                src_ds = None
                srcband = None
                
                postprocess_end = time.time()
                #print(f"{raster_name} Postprocessing: {postprocess_end - postprocess_st})")
                rasters.append({"rastername": zone_index[2], "featcnt": featCnt, "elapsedsecondsrasterize": round(rasterize_end - rasterize_st,2), "elapsedsecondspostprocessing": round(postprocess_end - postprocess_st,2), "postprocessing": postprocessing}) #"elapsedsecondsrasterize": round(rasterize_end - rasterize_st), 

            inpSrc = None #.Destroy()
    
        response = {
                "allgenerated":True,
                "status": True,
                "totalfeatcnt": totfeatcnt,
                "message":"Raster generation is complete.",
                "errormessage":"",                  
                "rasters":rasters
                }        

        return response