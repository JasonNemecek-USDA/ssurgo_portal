# x06.py

# References
#   https://gdal.org/api/python_gotchas.html

import csv
from inspect import getmembers, isgenerator
import json
from os import listdir, path
import sys
import time
from dlcore.dlutilities import DlUtilities

from utilities.runchild import RunChild

# Allow a conditional import test, this will only throw 
# an execption if environment has not been initialized.
try:
    from osgeo import ogr, osr, gdal
except:
    pass
import sqlite3
from sqlite3 import Error

class X06:
    def create_connection(db_file):
        # Usage: (status, conn, errormessage) = create_connection(db_file)
        conn = None
        try:
            conn = sqlite3.connect(db_file)
            status = True
            errormessage = ""
        except Error as e:
            status = False
            errormessage = f"Unable to open SQLite database connection to {db_file}"

        return (status, conn, errormessage)

    def isGeopackage(db_path):
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
        geopackage_identifier = 1196444487
        sql = 'PRAGMA application_id;' 

        isGeopackageTrue = None
        (status, conn, errormessage) = X06.create_connection(db_path)
        if not status:
            return (status, isGeopackageTrue, errormessage)

        cur = conn.cursor()
        cur.execute(sql)
        identifier = (cur.fetchone())[0]
        isGeopackageTrue = identifier == geopackage_identifier

        return (True, isGeopackageTrue, "")

    def getSacatalogData(root, subfolder):
        # Retrieve areasymbol and saverest for the subfolder
        # usage: (status, message, errormessage, areasymbolDictionary) = getSacatalogData(root, subfolder)
        # Status is True if the sacatlog.txt file can be read
        # Assume, for WSS SSURGO, that the subfolder name is the areasymbol 
        # and that the sacatalog CSV file is named as "sacatlog.txt".
        sacatalogFilename = 'sacatlog.txt'
        filePath = path.join(root, subfolder, "tabular", sacatalogFilename)
        if not path.exists(filePath):
            return (False, f"Checking sacatalog CSV file {filePath}", f"File {filePath} not found", {})

        areasymbolDictionary = {}
        with open(filePath, 'r') as file:
            csvreader = csv.reader(file, delimiter='|', quotechar='"')
            for row in csvreader:
                areasymbol = row[0]
                saverest = row[3]
                areasymbolDictionary[areasymbol] = saverest
        return (True, "", "", areasymbolDictionary)

    def loadSacatlogData(ssurgoDownloadRoot, database, responseSubfolder):
        # X06 hack: load all sacatalog data.
        # Assumes the WSS SSA format of SSURGO data.
        # Load the sacatalog csv file into the database and 
        # updates the areasymbol data in the subfolder dictionary
        # (passed by reference)
        # Note the spelling of the CSV file omits the second "a".
        # Returns (status, message, errormessage)
        sacatalogFile = path.join(ssurgoDownloadRoot, 'tabular\\sacatlog.txt')
        if path.exists(sacatalogFile):
            (status, conn, errormessage) = X06.create_connection(database)
            if not status:
                return (status, "Unable to open database connection.", errormessage)
            cur = conn.cursor()
            responseSubfolder["areasymbols"] = {}
            try:
                with open(sacatalogFile, 'r') as file:
                    csvreader = csv.reader(file, delimiter='|', quotechar='"')
                    for row in csvreader:
                        # Tease out the areasymbol and saverest
                        areasymbol = row[0]
                        saverest = row[3]
                        responseSubfolder["areasymbols"][areasymbol] = saverest
                        # Store the full CSV record
                        sql = '''
                            insert into sacatalog (areasymbol, areaname, saversion, saverest, tabularversion, 
                            tabularverest, tabnasisexportdate, tabcertstatus, tabcertstatusdesc, fgdcmetadata)
                            values(?, ?, ?, ?, ?,   ?, ?, ?, ?, ?)
                        '''
                        cur.execute(sql, row[0:-1])
            except Exception as ex:
                return (False, "Unable to transfer areasymbol and saverest to database", format(ex))
            finally:
                conn.commit()
                conn.close()

            return (True, "sacatalog loaded", "")

        else:
            return(False, "", f"sacatalogFile ({sacatalogFile}) not found, terminating.")

    def getSqlString(db_path, tablename, shapefile_name, dissolvemupolygon):
        # Get SQL string for use with gdal.VectorTranslate method.
        # Usage: (status, loadSql, errormessage)

        (status, conn, errormessage) = X06.create_connection(db_path)
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
        else:
            name = f'VectorTranslate_SQL_{tablename}'
            
        infoSql = f"SELECT value FROM systemtemplateinformation WHERE name='{name}';"

        cur = conn.cursor()
        cur.execute(infoSql)
        rows = cur.fetchall()

        loadSql = rows[0][0].replace('__shapename__', shapefile_name)

        cur.close()
        conn.close()

        return (True, loadSql, "")  

    def loadShapefileData(tablename, spatialPath, shapefileName,  database, db_format, dissolvemupolygon):
        # Returns (status, message, errormessage)
        try:
            shapefilePath = path.join(spatialPath, shapefileName + '.shp')
            (status, loadSql, errormessage) = X06.getSqlString(database, tablename, shapefileName, dissolvemupolygon)
            if not status:
                return (False, "Unable to open database.", errormessage)    
        except Exception as ex:
            return (False, "Error during spatial import", f"Error retrieving SQL query command for {shapefileName}", format(ex))

        try:
            gdal.UseExceptions()
            gdal.VectorTranslate(database, shapefilePath, SQLStatement = loadSql, 
                    SQLDialect = "SQLite", format=f'{db_format}', 
                    accessMode='append', layerName=tablename)
            return (True, f"shapefile {shapefileName} imported", "")
        except Exception as ex:
            return (False, f"Error reading shapefile {shapefileName}", format(ex))

    def loadAllShapefiles(childRequest):
        # Only valid for WSS SSA SSURGO.
        # Updates the areasymbol data in the subfolder dictionary
        # (passed by reference)
        # Returns (status, message, errormessage)
        # HAPPY PATH only

        database = childRequest["database"]
        shapefilepath = childRequest["shapefilepath"]
        dissolvemupolygon= childRequest["dissolvemupolygon"]
        shapefiles = childRequest["shapefiles"]    
        
        (status, isGeopackageTrue, errormessage) = X06.isGeopackage(database)
        if not status:
            (status, "Unable to connect to database.", errormessage)
        elif isGeopackageTrue:
            db_format = 'GPKG'
        else:   
            db_format = 'SQLite'

        # Iterate through each layer and its associated shapefile
        for tablename in shapefiles.keys():
            shapefileName = shapefiles[tablename]
            (status, message, errormessage) = \
                X06.loadShapefileData(tablename, shapefilepath, shapefileName,  database, db_format, dissolvemupolygon)
            if not status:
                return (status, "Error loading spatial data", errormessage)

        return (status, "", "")

    def importSpatialData(request):
        # This entry point is called in the context of a 
        # subprocess invocation from within importCandidates.
        # Load all shapefiles, assume WSS format for spatial folder
        # HAPPY PATH only
        (status, message, errormessage) = X06.loadAllShapefiles(request)  
        response = {
            "status": status,
            "message": message,
            "errormessage": errormessage
        }
        return response

    def initiateSpatialDataImport(loadspatialdatawithinsubprocess, candidatePath, database, subfolderName, dissolvemupolygon):
        # Spatial data import is handled either in a child process
        # or directly in-line.
        # "candidatePath" is the path to the current folder SSURGO folder.
        # "folder" is the related entry in the request that had been sent to importCandidates.
        # Returns  (status, message, errormessage, subfolder)

        # HACK: specific for WSS SSA SSURGO package
        areasymbol = subfolderName
        shapefiles = {}
        shapefiles["featline"] = f'soilsf_l_{areasymbol}'
        shapefiles["featpoint"] = f'soilsf_p_{areasymbol}'
        shapefiles["muline"] = f'soilmu_l_{areasymbol}'
        shapefiles["mupoint"] = f'soilmu_p_{areasymbol}'
        shapefiles["mupolygon"] = f'soilmu_a_{areasymbol}'
        shapefiles["sapolygon"] = f'soilsa_a_{areasymbol}'  
        shapefilepath = path.join(candidatePath, 'spatial')

        childRequest = {
            "request": "importspatialdata",
            "database": database,
            "shapefilepath": shapefilepath,
            "dissolvemupolygon": dissolvemupolygon,
            "shapefiles": shapefiles
        }

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
                return  (status, message, "")
            else:
                return  (status, "Error encountered.", message)
        else:
            # case: load in the current process
            (status, message, errormessage) = \
                X06.loadAllShapefiles(childRequest)
            return (status, message, errormessage)

    def getDistanceSquared(x, y, originX, originY):
        # Return the cartesian distance-squared of (x,y) from an origin.
        # Used for ordering survey area centroids
        distanceSquared = pow(x - originX, 2) + pow(y - originY, 2)
        return distanceSquared   

    def getChildDistanceSquaredAndMbr(root, ssaName):
        # Return the distanceSquared and MBR of the survey area's centroid from the sapolygon shapefile.
        # Returns (distanceSquared, minX, maxX, minY, maxY)
        # Speccific to WSS SSA SSURGO format
        filename = f'soilsa_a_{ssaName}.shp'
        shapefile = path.join(root, ssaName, "spatial", filename)
        driver = ogr.GetDriverByName('ESRI Shapefile')
        dataSource = driver.Open(shapefile, 0)
        layer = dataSource.GetLayer()

        originX = -180
        originY = 90

        distanceSquared = 0
        for feature in layer:
            geom = feature.GetGeometryRef()
            distanceSquared = X06.getDistanceSquared(geom.Centroid().GetX(),geom.Centroid().GetY(), originX, originY)
            # The envelope is a 4-tuple: (minX, maxX, minY, maxY)
            env = geom.GetEnvelope()
            break

        return (distanceSquared, env[0], env[1], env[2], env[3])

    def getSpatialSummary(request, getMbr):
        # Given the request with a list of subfolders, 
        # returns a subfolder list (cloned from the request)
        # with distance-squared from a NW origin and MBR for each.
        # We don't do much of this if istabularonly is true
        # or if loadinspatialorder is false.
        # Note: WSS SSA is assumed
        # Usage: 
        # Returns 
        #   (sortedSubfolders, minXaggregated, maxXaggregated, minYaggregated, maxYagrgegated)
        # Note that if a new list is not required the old list is preserved.

        istabularonly = request["istabularonly"]
        performSort = request["loadinspatialorder"]

        # Short circuit: if no spatial data are involved, return the 
        # folder list as-is.
        # Additionally, if an MBR is not needed and sort order is not required,
        # we can also return early
        if istabularonly or (not getMbr and not performSort):
            return (request["subfolders"], None, None, None, None)
        
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
            if isFirst:
                (distanceSquared, minXaggregated, maxXaggregated, minYaggregated, maxYaggregated) = \
                    X06.getChildDistanceSquaredAndMbr(request["root"], originalSubfolder)
                distancesSquared.append(distanceSquared)
                isFirst = False
            else:
                (distanceSquared, minX, maxX, minY, maxY) = \
                    X06.getChildDistanceSquaredAndMbr(request["root"], originalSubfolder)
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
            return (sortedFolders, minXaggregated, maxXaggregated, minYaggregated, maxYaggregated)    
        else:
            # Only the MBR is required, return the original list,
            return (request["subfolders"], minXaggregated, maxXaggregated, minYaggregated, maxYaggregated)

    def updateGeopackageMbr(database, minXaggregated, maxXaggregated, minYaggregated, maxYaggregated):
        # Given a GeoPackage and not a tabular-only import,
        # update the MBR for all tables in the database.
        # Usage: (status, errormessage) = (updateGeopackageMbr...)

        # Use the stored sapolygon's max_y < 90 as a proxy for an initialized database.
        # We only want one row.
        checkSql = \
            "select min_x, min_y, max_x, max_y, max_y < 90 as [isinitialized] " \
            + "from gpkg_contents where table_name = 'sapolygon';"
        (status, conn, errormessage) = X06.create_connection(database)
        if not status:
            return (status, errormessage)
        cur = conn.cursor()
        cur.execute(checkSql)
        (min_x, min_y, max_x, max_y, isinitialized) = cur.fetchall()[0]

        updateSql = "update gpkg_contents set min_x=?, min_y=?, max_x=?, max_y=?;"
            
        if isinitialized:
            # Case: initialized database, determine updated values
            min_x = min(min_x, minXaggregated)
            min_y = min(min_y, minYaggregated)
            max_x = max(max_x, maxXaggregated)
            max_y = max(max_y, maxYaggregated)           
        else:
            # Case: uninitialized database, replace all values
            min_x = minXaggregated
            min_y = minYaggregated
            max_x = maxXaggregated
            max_y = maxYaggregated

        cur.execute(updateSql, (min_x, min_y, max_x, max_y))
        conn.commit()
        conn.close()

        return (True, "")

    def pretestImportCandidates(request):
        # Use case 5a request: pretestImportCandidates
        # Use case 5: "Import one or more SSAs into an ET from a set of subfolders 
        # that I choose under a containing folder that I specify."
        # Perform a "pre-test" on one or more SSAs from a set of subfolders that I 
        # choose under a root folder.
        # Use "<script> ?pretestimportcandidates" to retrieve schemas with request and response fields.

        # IMPORTANT: this demo code is only for WSS SSA SSURGO. It does not 
        # track multiple SSAs nor WSS AOI or NASIS.

        # Get child data
        istabularonly = request["istabularonly"]
        root = request["root"]
        children = []
        if not path.exists(root):
            response = {"status":False, "errormessage":f'root does not exist, root="{root}"'
                }
            return response
        elif path.isfile(root):
            response = {"status":False, "errormessage":f'root is a file, not a folder, root="{root}"'
                }
            return response        

        # If the subfolders list is not in the request, then 
        # all child folders of the root will be tested.
        if "subfolders" in request:
            # Case: folder list supplied
            subfolders = request["subfolders"]
        else:
            # Case: no folder list supplied, get all child folder names
            subfolders = []
            for name in listdir(root):
                childPath = path.join(root, name)
                if  path.isdir(childPath):
                    # case: we have a folder
                    subfolders.append(name)

        allpassed = True
        for subfolder in subfolders:
            # Get sacatalog and sapolygon-derived data
            # Status is true if the sacatalog data are available
            (status, message, errormessage, areasymbolDictionary) = X06.getSacatalogData(root, subfolder)
            allpassed = allpassed and status
            if status:
                children.append({
                    "childfoldername": subfolder, 
                    "preteststatus": True,
                    "errormessage": "",
                    "areasymbols": areasymbolDictionary})
            else:
                children.append({
                    "childfoldername": subfolder, 
                    "preteststatus": False,
                    "errormessage": errormessage,
                    "areasymbols": areasymbolDictionary})

        response = {
            'status': True,
            'allpassed': allpassed,
            'message' : '',
            'errormessage': '',
            'subfolders': children
        }
        return response

    def importCandidates(request):
        # HACK for x06
        # Initial support for WSS SSA import, only loads sacatalog and 
        # shapefiles. Not fault tolerant.
        # Note that any useful information from a pretest is 
        # ignored in this implementation.

        # Check that the root folder exists
        root = request["root"]
        if not path.exists(root):
            response = {"status":False, "allimported": False, 
                "message":"", "errormessage":f'root does not exist, root="{root}"'
                }
            return response
        elif path.isfile(root):
            response = {"status":False, "allimported": False, 
                "message":"", "errormessage":f'root is a file, not a folder, root="{root}"'
                }
            return response

        # Tease out a list of paths for the subfolders.
        # The subfolder array will be recreated as the individual 
        # candidates are imported.
        response = {"status":True, "allimported": False, "message":"", "errormessage":"", "subfolders":[]}

        # Do we perform the mupolygon dissolve on mukey value?
        dissolvemupolygon = request["dissolvemupolygon"]

        # SORT POINT - if needed, reorder subfolders by spatial ordering
        # before iterating through them.
        # We also have an MBR that can be used to update a GeoPackage
        database = request["database"]

        (status, isGeopackageTrue, errormessage) = X06.isGeopackage(database)
        if not status:
            response["message"] = "Unable to connect to database."
            response["errormessage"] = errormessage
            response["status"] = False
            return response

        getMbr = (isGeopackageTrue and not request["istabularonly"])
        (sortedSubfolders, minXaggregated, maxXaggregated, minYaggregated, maxYaggregated) = \
            X06.getSpatialSummary(request, getMbr)
        if getMbr:
            X06.updateGeopackageMbr(database, minXaggregated, maxXaggregated, minYaggregated, maxYaggregated)
        istabularonly = request["istabularonly"]

        # We can now iterate through the (possibly sorted) list of folder names.
        for requestSubfolderName in sortedSubfolders:
            responseSubfolder = {}
            responseSubfolder["childfoldername"] = requestSubfolderName
            # responseSubfolder is the response folder for a specific requestSubfolderName
            responseSubfolder["elapsedsecondstabularimport"] = 0
            responseSubfolder["elapsedsecondsspatialimport"] = 0

            # "root" is the folder that contains SSURGO package child folders.
            # "requestSubfolderName" is the path to an individual SSURGO folder.
            candidatePath = path.join(request["root"], requestSubfolderName)

            # Delete all areasymbols that are referenced in the sacatlog CSV file
            (status, message, errormessage, areasymbolDictionary) = X06.getSacatalogData(request["root"], requestSubfolderName)
            if not status:
                response["subfolders"].append(responseSubfolder)
                response["allimported"] = False
                response["message"] = message
                response["errormessage"] = errormessage
                return response
            else:
                (status, connection, errormessage) = DlUtilities.create_connection(database)
                if not status:
                    response["subfolders"].append(responseSubfolder)
                    response["allimported"] = False
                    response["message"] = message
                    response["errormessage"] = errormessage
                    return response
                for areasymbol in areasymbolDictionary:
                    (status, message, errormessage) = DlUtilities.deleteAreasymbol(database, areasymbol, connection)
                    if not status:
                        connection.close()
                        response["subfolders"].append(responseSubfolder)
                        response["allimported"] = False
                        response["message"] = message
                        response["errormessage"] = errormessage
                        return response
                if connection: connection.close()

            # Development note: In this POC code, only sacatalog is loaded.
            # This is where tabular data for the child folder is loaded.

            start_time_tabular = time.time()
            (status, message, errormessage) =  \
                X06.loadSacatlogData(candidatePath, request["database"], responseSubfolder)
            end_time_tabular = time.time()
            time_elapsed_tabular = (end_time_tabular - start_time_tabular)
            responseSubfolder["elapsedsecondstabularimport"] = round(time_elapsed_tabular)

            if not status:
                response["subfolders"].append(responseSubfolder)
                response["allimported"] = False
                response["message"] = message
                response["errormessage"] = errormessage
                return response
                
            # Load the spatial data
            if not istabularonly:
                start_time_spatial = time.time()
                (status, message, errormessage) = \
                    X06.initiateSpatialDataImport(request["loadspatialdatawithinsubprocess"], candidatePath, request["database"], requestSubfolderName, dissolvemupolygon)
                end_time_spatial = time.time()
                time_elapsed_spatial = (end_time_spatial - start_time_spatial)
                responseSubfolder["elapsedsecondsspatialimport"] = round(time_elapsed_spatial)

                if not response["status"]:
                    response["subfolders"].append(responseSubfolder)
                    response["allimported"] = False
                    response["message"] = message
                    response["errormessage"] = errormessage
                    return response

            # The subfolder was imported successfully
            response["subfolders"].append(responseSubfolder)

        # All is well
        response["allimported"] = True
        response["message"] = "SSURGO data import succeeded."

        return response