# dlutilities.py

import os
from datetime import datetime
import pathlib
import re
import sqlite3
import sys
from zipfile import ZipFile

import config
import re

class DlUtilities:
    # JSON "Utility" requests.
    # These exclude some of the DL Core parsing and status methods.

    def debug_run_query_on_connection(conn, sql):
        # As an aid to debugging, executes the sql query against 
        # the current connection. Invole with
        #   DlUtilities.debug_run_query_on_connection(conn, sql)
        # Returns the set of rows.
        # The cursor is closed, no commit is performed.
        cursor = conn.cursor()
        cursor.execute(sql)
        rows = cursor.fetchall()
        cursor.close()
        return rows

    def testFileExists(filePath, message, regex=None):
        # Returns status = True if filePath exists and points to a file  (plus an empty errormessage),
        # otherwise returns status = False and errormessage containing "message" and the filePath.
        # Usage: (status, errormessage) = testFileExists(filePath, message)
        if not os.path.exists(filePath):
            return (False, f'{message}, path "{filePath}" does not exist.')
        if regex:
            r = re.compile(regex)
            regex_matches = list(filter(r.match, os.listdir(filePath)))
            if not regex_matches:
                return (False, f'{message}, regex "{regex}" not found in {filePath}.')
        elif not os.path.isfile(filePath):
            return (False, f'{message}, path "{filePath}" is not a file.')
        return (True, '')

    def getRegexMatches(filePath, regex):
            r = re.compile(regex)
            regex_matches = list(filter(r.match, os.listdir(filePath)))
            return (regex_matches)

    def testFolderExists(folderPath, message):
        # Returns status = True if folderPath exists and points to a folder (plus an empty errormessage),
        # otherwise returns status = False and errormessage containing "message" and the folderPath.
        # Usage: (status, errormessage) = testFileExists(folderPath, message)
        if not os.path.exists(folderPath):
            return (False, f'{message} does not exist.')
        elif not os.path.isdir(folderPath):
            return (False, f'{message}, path "{folderPath}" is not a folder.')
        else:
            return (True, '')          

    def deleteAreasymbol(database, areasymbol, conn):
        # Remove areasymbol from sacatalog, assume cascading deletion
        # Usage: (status, message, errormessage) = deleteAreasymbol(database, areasymbol, conn)
        message = f'Attempting to delete areasymbol="{areasymbol}"'
        try:
            cur = conn.cursor()
            sql = f"delete from sacatalog where lower(areasymbol) = lower('{areasymbol}');"
            cur.execute(sql)
            conn.commit()
            return (True, message, "")
        except BaseException as err:
            return (False, message, f'Failed: err="{format(err)}')

    def create_connection(db_file):
        # Usage: (status, connection, errormessage) = create_connection(db_file):
        # Side effect: PRAGMA foreign_keys = ON executed on the connection.
        # reference: https://www.sqlite.org/foreignkeys.html
        conn = None
        try:
            if not os.path.exists(db_file):
                return (False, None, f"Database file {db_file} not found")    
            conn = sqlite3.connect(db_file)
            conn.execute("PRAGMA foreign_keys = ON")
            return (True, conn, "")
        except BaseException as e:
            return (False, None, f"unable to open SQLite database connection to {db_file}, err={format(e)}")


    @staticmethod
    def getStatus():
        # Utility request: getStatus
        # Returns a response indicating that the Data Loader core is responding.
        # Use "<script> ?getstatus" to retrieve schemas with request and response fields.

        # path experiments
        argv0 = sys.argv[0]
        p = pathlib.PurePath(argv0)

        response = {"status": True, 
            "message":f"It's alive! runmode={format(config.get('runmode'))}, isPyz={argv0.endswith('.pyz')}, __file__={__file__}, currentPath={p.parent}", "errormessage": ""}
        return response

    @staticmethod
    def getWindowsDriveLetters():
        # Utility request: getWindowsDriveLetters
        # For Microsoft Windows, returns a list of all drive letters.
        # Use "<script> ?getwindowsdriveletters" to retrieve schemas with request and response fields.
        response = {"status": True, 
                    "drives": list(filter(lambda d: os.path.exists(f'{d}:'), 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'))}
        return response    

    def getFolderNodes(path, compiledfolderpattern, compiledfilepattern, showfiles, maxdepth):
        # Assemble list of nodes and children at this nesting level.
        # Usage:  (status, nodes, errormessage) = getFolderNodes(path, matchpattern, showfiles, maxdepth)
        # Terminates activity at any error
        status = True
        nodes = []
        errormessage = ""
        currentPath = ""

        try:
            try:
                #Check to see if all items within the directory have proper permissions.
                #This is mainly for maxdepth and folders.
                os.listdir(path)
            except PermissionError:
                #If not skip this directory
                status = True
                nodes = ""
                errormessage = ""
                return (status, nodes, errormessage)
            # Iterate through current path for matching folders and files
            for name in os.listdir(path):
                currentPath = os.path.join(path, name)
                thisNode = {"name": ""}
                if config.osType == "Windows":                    
                    #format lastmodified date for windows machines
                    thisNode["lastmodified"] = datetime.fromtimestamp(os.path.getmtime(currentPath)).strftime(r'%#m/%#d/%Y %#I:%M %p') 
                else:
                    #format lastmodified date for nonwindows machines
                    thisNode["lastmodified"] = datetime.fromtimestamp(os.path.getmtime(currentPath)).strftime(r'%-m/%-d/%Y %-I:%M %p')
                if  os.path.isdir(currentPath):
                    # case: we have a folder
                    if ((not compiledfolderpattern)
                        or (compiledfolderpattern and compiledfolderpattern.match(name))):
                        thisNode["name"] = name
                        thisNode["type"] = "File Folder"
                        thisNode["size"] = ""
                        if maxdepth:
                            (status, childNodes, errormessage) = DlUtilities.getFolderNodes(currentPath, "", "", showfiles, maxdepth -1)
                            if not status:
                                return  (status, None, errormessage)
                            if childNodes:
                                #This logic is meant for the UI to prevent users from drilling down too far into a folder.
                                #Currently the only filtering critera is the presence of a Tabluar folder.
                                #In the future, more filtering criteria may need to be established.
                                for node in childNodes:
                                    if node["name"] == "tabular":
                                        thisNode["containsssurgo"] = True
                                        break
                                    else:
                                        thisNode["containsssurgo"] = False
                        nodes.append(thisNode)
                elif os.path.isfile(currentPath) and showfiles:
                    # case: we have a file
                    if showfiles:
                        if ((not compiledfilepattern)
                            or (compiledfilepattern and compiledfilepattern.match(name))):
                            thisNode["name"] = pathlib.Path(currentPath).stem
                            thisNode["type"] = f'{pathlib.Path(currentPath).suffix.upper()[1:]} File'
                            if os.path.getsize(currentPath) / 1024 < 1:
                                thisNode["size"] = "1 KB"
                            else:                                                            
                                thisNode["size"] = str(int(os.path.getsize(currentPath) / 1024)) + " KB"
                            nodes.append(thisNode)
            return (True, nodes, errormessage)
        except BaseException as err:
            status = False
            nodes = None
            errormessage = f"Unexpected err '{err}' at {currentPath}, {format(err)}"
            return (status, nodes, errormessage)

    def getFolderTree(request):        
        # Utlity request: getFolderTree
        # Returns a file system tree.
        # (for Python Regex see https://docs.python.org/3/howto/regex.html)
        # Use "<script> ?getfoldertree" to retrieve schemas with request and response fields.
        path = request['path']
        folderpattern = request['folderpattern']
        ignorefoldercase = request["ignorefoldercase"]
        filepattern = request['filepattern']
        ignorefilecase = request["ignorefilecase"]
        showfiles = request['showfiles']
        maxdepth = request['maxdepth']

        # Is the path valid?
        try:
            if not os.path.exists(path):
                response = {
                    "status": True, 
                    "message": f"No folders or files found at path={path}"
                }
                return response     
        except Exception as err:
            response = {
                "status": False, 
                "message": f"Error when checking path={path}",
                "errormessage": f'Failure when checking path={path}, error={format(err)}'
            }
            return response

        # Assemble list of top-level nodes. 
        if not folderpattern:
            compiledfolderpattern = False
        elif ignorefoldercase:
            compiledfolderpattern = re.compile(folderpattern, re.IGNORECASE)
        else:
            compiledfolderpattern = re.compile(folderpattern)

        if not filepattern:
            compiledfilepattern = False
        elif ignorefilecase:
            compiledfilepattern = re.compile(filepattern, re.IGNORECASE)
        else:
            compiledfilepattern = re.compile(filepattern)

        (status, nodes, errormessage) = DlUtilities.getFolderNodes(path, compiledfolderpattern, compiledfilepattern, showfiles, maxdepth)
    
        response = {
            "status": status, 
            "message": "",
            "errormessage": errormessage
        }
        if nodes: response["nodes"] = nodes

        return response
