from fileinput import close
from posixpath import splitext
import sqlite3, webbrowser, sys, json, os, shutil, io, config, threading, subprocess
from datetime import datetime, date
from json import JSONEncoder
from zipfile import ZipFile, is_zipfile
from dlcore import dispatch
from dlcore import x06 as dataLoading
from dlcore.SSURGODownloader import BulkDownloader
from time import sleep
from template_logger import tlogger

firstRun = True

if config.isPyzFile:
    ssurgo_portal_ui = 'resources/ssurgo_portal_UI.html' 
else:
    fullPath = './SSURGO_TEMPLATE/pyz'
    ssurgo_portal_ui = fullPath + '/resources/ssurgo_portal_UI.html'

try:
    from bottle import run, template, request, response, route, post, static_file, TEMPLATES, Bottle, redirect
    import requests
except:
    pass

webpage = Bottle()
#logic to process template files from a PYZ file
if config.isPyzFile:
    #PYZ variables
    tail = '\\dphost\\webpage.py'
    zippath = __file__[0:(len(__file__) - len(tail))]
    def render_template(filePath):
        """Used to get templates from a PYZ file. Valid arguments for this method are plaintext and template"""
        with ZipFile(zippath) as dpzip:
            with io.TextIOWrapper(dpzip.open(filePath), encoding='utf-8') as templateResult:
                content = templateResult.readlines()
                plaintext = ''.join(content)
        dpzip.close()
        # Is there a difference between returning the plain text vs a template(plaintext) object? 
        """     Yes when doing template(plaintext) the python code is executed. This will cause parts of the template that rely
            on python variables not to load""" 
        try:
            return plaintext
        except:
            return print('error in render_template')

def defaultconverter(o):
    """Converts a date time into a more user friendly format"""
    if isinstance(o, datetime.date):
        return o.isoformat()
#-----------------------------------Bottle Route methods-------------------
@webpage.route('/tlogger/<logmsg>')
def post_log(logmsg):
    msgType, msgTxt = logmsg.split(':')
    if msgType == 'debug':
        tlogger.debug(msgTxt)
    elif msgType == 'warning':
        tlogger.warning(msgTxt)
    elif msgType == 'error':
        tlogger.error(msgTxt)
    elif msgType == 'critical':
        tlogger.critical(msgTxt)
    #Gets both 'info' messages and any incorrectly formatted msgTypes.
    else:
        tlogger.info(msgTxt)

@webpage.get('/checkInternet')
def checkInternetConnection() -> tuple[bool, int, str, str]:
    from requests import get, HTTPError, ConnectionError, head, Response
    '''Check to see if we can access the internet. Returns status and message.'''
    url = config.get('wssUrl') + "app/"
    try:
        wssResponse = head(url, timeout=5)
        response = {
            'status' : True if wssResponse.status_code == 200 else False
            ,'wss_status_code' : wssResponse.status_code
            ,'message': 'Host is able to communicate with WSS' if wssResponse.status_code == 200 else 'Host is unable to communicate with WSS'
            ,'url': wssResponse.url
        }
        return response
    except HTTPError as e:
        message = "HTTPError error, unable to communicate with WSS."
        tlogger.error(message + "\n" + e.args[0].args[0])
        response = {
            'status': False
            ,'wss_status_code': 400
            ,'message': message
            ,'errormessage': e.args[0].args[0]
        }
        return response
    except ConnectionError as e:
        message = "Connection error, unable to communicate with WSS. User may be disconnected from the internet."
        tlogger.error(message + '\n' + e.args[0].args[0])
        response = {
            'status': False
            ,'status_code': 500
            ,'message': message
            ,'errormessage': e.args[0].args[0]
        }
        Response.status_code = 500
        return response
    except Exception as e:
        message = "Unknown error, unable to communicate with WSS. User may be disconnected from the internet."
        tlogger.error(message + '\n' + str(e))
        response = {
            'status': False
            ,'status_code': 500
            ,'message': message
            ,'errormessage': e.args[0].args[0]
        }
        Response.status_code = 500
        return response

@webpage.get('/SSURGOPortalURL')
def getSSURGOPortalURL():
    return config.get("versionURLs")["SSURGOPortalURL"]

@webpage.route('/getVersion')
def get_version():
    #Errors might be due to no internet connection, server being down, version.txt missing, etc.
    try:
        verResp = requests.get(config.get("versionURLs")["versionTxtURL"])
        if verResp.status_code == 200:
            return verResp.text
        else:
            response.status = 500
            return 'Error fetching version information'
    except Exception as e:
        response.status = 500
        return 'Error: ' + str(e)

@webpage.route('/startUp')
def getStartupInfo():
    checkVersionInfo()
    redirect('/SSURGOPortalUI')

#get request. Used on initial load. Imediately after initial load a post request is issued by ssurgo_portal_scripts.js to get the folder tree.
@webpage.route('/SSURGOPortalUI')
def display_SSURGOPortalUI():
    if config.isPyzFile == True:
        rendered_ssurgo_portal_ui = render_template(ssurgo_portal_ui)
        output = template(rendered_ssurgo_portal_ui)        
    else:
        output = template(ssurgo_portal_ui)        
    return output

#This can also be represented by @route('/start', method = 'post')
@webpage.post('/SSURGOPortalUI')
def ssurgoPortalUI_request():
    response = dispatch.Dispatch.dispatch(request.json)
    return response

@webpage.post('/bulkssadownload')
def bulkssadownload():
    bulkD = BulkDownloader(request.json)
    response = bulkD.bulkDownload
    return response

@webpage.post('/uploadBlob')
def uploadBlob():
    """This method takes the information held in the browsers memory and saves the zip file onto the users machine."""

    filename = request.forms.filename
    print(filename)
    location = request.forms.location
    print(location)
    overwrite = request.forms.overwrite    
    print(overwrite)
    upload = request.files.get('file')
    print(upload.filename)
    
    if upload:
        blob = upload.file.read()
        filepath = filename

        if location:
            filepath = os.path.join(location, filename)

        if overwrite == "1":
            with open(filepath, 'wb') as f:
                print(filepath)
                f.write(blob)
        else:
            with open(filepath, 'xb') as f:
                print(filepath)
                f.write(blob)

        return json.dumps({"success": True})
    else:
        return json.dumps({"success": False})

@webpage.post('/uncompress')
def uncompress():

    location = request.forms.location
    print(location)
    overwrite = request.forms.overwrite    
    print(overwrite)
    file = request.forms.file
    print(file)

    if file:
        zippath = os.path.join(location, file)
        folderpath = os.path.splitext(zippath)[0]

        if(not os.path.exists(zippath)):
            return json.dumps({"success": False, "message": "File doesn't exist."})
        
        if not is_zipfile(zippath):
            return json.dumps({"success": False, "message": "File is not a zip file."})

        with ZipFile(zippath, "r") as zip_ref:
            for member in zip_ref.infolist():
                file_path = os.path.join(location, member.filename)
                if (not os.path.exists(file_path)) or (overwrite == "1"):
                    zip_ref.extract(member, location)

        os.remove(zippath)
        return json.dumps({"success": True, "message": f"{file} extracted to: {location}"})


@webpage.get('/logFile')
def getLogFile():
    if config.isPyzFile:
        return os.path.dirname(zippath)
    else: 
        return os.getcwd()

@webpage.post('/close')
def kill_server():
    if config.isPyzFile:
        sys.stderr.close()
    else:
        print("KILL SERVER COMMAND")

@webpage.get('/serverStatus')
def is_server_running():
    global firstRun
    if not firstRun:
        sleep(2)    
    firstRun = False
    return

#Checks if a file already exists & returns a boolean
@webpage.post('/fileExists')
def fileExists(): 
    failedFolders = []
    for folder in request.json:
        if not os.path.exists(folder):
            failedFolders.append(folder)
    return json.dumps({"failedfolders" : failedFolders})    

#Returns static files like JS and CSS
@webpage.route('/static/<filename>')
def server_static(filename):
    if config.isPyzFile:
        with ZipFile(zippath) as dpzip:
            with io.TextIOWrapper(dpzip.open('resources/' + filename), encoding='utf-8') as templateResult:
                content = templateResult.readlines()
                plaintext = ''.join(content)        
            dpzip.close()
            return template(plaintext)
    else:
        return static_file(filename, fullPath + "/resources/") 
    
#Returns static files like JS and CSS
@webpage.route('/static/js/<filename>')
def server_static_js(filename):
    if config.isPyzFile:
        with ZipFile(zippath) as dpzip:
            with io.TextIOWrapper(dpzip.open('resources/' + filename), encoding='utf-8') as templateResult:
                content = templateResult.readlines()
                plaintext = ''.join(content)        
            dpzip.close()
            response.body = plaintext
            response.content_type = "text/javascript"
            return response
    else:
        return static_file(filename, fullPath + "/resources/", mimetype="text/javascript")

#Create a route that allows for a more structured debugging experience. Since the sapoly.geojson file is saved outside of the pyz,
#we do not need to worry about specially handling this file.
@webpage.route('/static/sapoly.geojson')
def load_sapoly():
    if config.isPyzFile:
        return static_file("sapoly.geojson", root="./")
    else:
        return static_file("sapoly.geojson", fullPath + "/resources/") 

#Load sub html components such as the NRCS logo and text
@webpage.route('/static/SubComponents/HtmlComponents/<filename>')
def get_html_components(filename):
    if config.isPyzFile == True:
        rendered_html_component = render_template('resources/SubComponents/HtmlComponents/' + filename)
        output = template(rendered_html_component)        
    else:
        output = template(fullPath + '/resources/SubComponents/HtmlComponents/' + filename)        
    return output

#Load any sub component js items
@webpage.route('/static/SubComponents/JsComponents/<filename>')
def get_html_components_scripts(filename):
    if config.isPyzFile:
        with ZipFile(zippath) as dpzip:
            with io.TextIOWrapper(dpzip.open('resources/SubComponents/JsComponents/' + filename), encoding='utf-8') as templateResult:
                content = templateResult.readlines()
                plaintext = ''.join(content)        
            dpzip.close()
            response.body = plaintext
            response.content_type = "text/javascript"
            return response        
    else:
        return static_file(filename, fullPath + "/resources/SubComponents/JsComponents/", mimetype="text/javascript")

@webpage.route('/static/css/<filename>')
def get_css(filename):
    if config.isPyzFile:
            response.body = render_template('resources/css/' + filename)
            response.content_type = "text/css; charset=UTF-8"
            return response
    else:
        return static_file(filename, fullPath + "/resources/css/")

#Returns images. CAN ONLY ACCCEPT SVG FILES.
@webpage.route('/static/images/<filename>')
def get_image(filename):
    if config.isPyzFile:
        response.body = render_template('resources/images/' + filename)
        response.content_type = "image/svg+xml"
        return response
    else:
        return static_file(filename, fullPath + "/resources/images/", "image/svg+xml")

@webpage.route('/static/services/<filename>')
def get_services(filename):
    if config.isPyzFile:
        with ZipFile(zippath) as dpzip:
            with io.TextIOWrapper(dpzip.open('resources/services/' + filename), encoding='utf-8') as templateResult:
                content = templateResult.readlines()
                plaintext = ''.join(content)        
            dpzip.close()
            response.body = plaintext
            response.content_type = "text/javascript"
            return response
    else:
        return static_file(filename, fullPath + "/resources/services/", mimetype="text/javascript") 
    
@webpage.route('/static/JsLibrary/<library>/<filename>')
def server_library(library, filename):    
    if config.isPyzFile:
        with ZipFile(zippath) as dpzip:
            with io.TextIOWrapper(dpzip.open("resources/SubComponents/JsLibraries/" + library +"/"+ filename), encoding='utf-8') as templateResult:
                content = templateResult.readlines()
                plaintext = ''.join(content)        
            dpzip.close()
            response.body = plaintext
            response.content_type = "text/javascript"
            return response
    else:
        return static_file(filename, fullPath + "/resources/SubComponents/JsLibraries/" + library, mimetype="text/javascript")

#Leaflet Routes
@webpage.route('/leaflet/javascript/<filename>')
def get_leaflet_javascript(filename):
    if config.isPyzFile:
        with ZipFile(zippath) as dpzip:
            with io.TextIOWrapper(dpzip.open('resources/leaflet/javascript/' + filename), encoding='utf-8') as templateResult:
                content = templateResult.readlines()
                plaintext = ''.join(content)        
            dpzip.close()
            return plaintext
    else:
        return static_file(filename, fullPath + "/resources/leaflet/javascript/") 

@webpage.route("/leaflet/css/<filename>")
def get_leaflet_css(filename):
    if config.isPyzFile:
            response.body = render_template('resources/leaflet/css/' + filename)
            response.content_type = "text/css; charset=UTF-8"
            return response
    else:
        return static_file(filename, fullPath + "/resources/leaflet/css/")

#USWDS Routes
@webpage.route('/uswds/javascript/<filename>')
def server_static(filename):
    if config.isPyzFile:
        with ZipFile(zippath) as dpzip:
            with io.TextIOWrapper(dpzip.open('resources/uswds/javascript/' + filename), encoding='utf-8') as templateResult:
                content = templateResult.readlines()
                plaintext = ''.join(content)        
            dpzip.close()
            return plaintext
    else:
        return static_file(filename, fullPath + "/resources/uswds/javascript/") 

@webpage.route("/uswds/css/<filename>")
def get_uswds_css(filename):
    if config.isPyzFile:
            response.body = render_template('resources/uswds/css/' + filename)
            response.content_type = "text/css; charset=UTF-8"
            return response
    else:
        return static_file(filename, fullPath + "/resources/uswds/css/")
    
@webpage.route('/uswds/img/<filename>')
def get_uswds_image(filename):
    if config.isPyzFile:
        response.body = render_template('resources/uswds/images/' + filename)
        response.content_type = "image/svg+xml"
        return response
    else:
        return static_file(filename, fullPath + "/resources/uswds/images/", "image/svg+xml")

@webpage.route('/uswds/img/<iconType>/<filename>')
def get_nested_uswds_image(iconType, filename):
    if config.isPyzFile:
        response.body = render_template(f'resources/uswds/images/{iconType}/{filename}')
        response.content_type = "image/svg+xml"
        return response
    else:
        return static_file(filename, fullPath + "/resources/uswds/images/" + iconType, "image/svg+xml")
    
@webpage.route('/uswds/fonts/<fontFolder>/<filename>')
def get_font(fontFolder, filename):
        if config.isPyzFile:
            with ZipFile(zippath) as dpzip:
                with io.TextIOWrapper(dpzip.open('/resources/uswds/fonts/' + fontFolder + filename), encoding='utf-8') as templateResult:
                    content = templateResult.readlines()
                    plaintext = ''.join(content)
                dpzip.close()
            return template(plaintext)
        else:
            return static_file(filename, fullPath + "/resources/uswds/fonts/" + fontFolder)    

#Called from __main__.py.
def checkVersionInfo():    
    cookieVersion = request.get_cookie("ApplicationVersion")  
    configVersion = config.get("versionInformation")
    if cookieVersion == None or cookieVersion != configVersion:
        TEMPLATES.clear()
        webpage.reset()
        response.set_cookie("ApplicationVersion", configVersion["ApplicationVersion"], samesite='Strict')
        response.set_cookie("SQLiteSSURGOTemplateVersion", configVersion["SQLiteSSURGOTemplateVersion"], samesite='Strict')
        response.set_cookie("SSURGOVersion", configVersion["SSURGOVersion"], samesite='Strict')
        response.set_cookie("wssUrl", config.get("wssUrl"), samesite='Strict')
        response.set_cookie("wssDownloadUrl", config.get("wssDownloadUrl"), samesite='Strict')
        response.set_cookie("sdaUrl", config.get("sdaUrl"), samesite='Strict')
        response.set_cookie("sdaPostRestUrl", config.get("sdaPostRestUrl"), samesite='Strict')

def runServer():
    """Main method for running the bottle server. Use threading to allow the webbrowser to execute after the server is started."""
    if config.isPyzFile:
        threading.Thread(target=run, kwargs={"app":webpage, "host":"localhost", "port":8083}).start()
    else:
        threading.Thread(target=run, kwargs={"app":webpage, "host":"localhost", "port":8083, "debug":True}).start()
    threading.Thread(target=webbrowser.open, args=['http://localhost:8083/startUp', 1, True], daemon=True).start()

def runServerDebugging(argv):
    if config.isPyzFile:
        threading.Thread(target=run, kwargs={"app":webpage, "host":"localhost", "port":8083}).start()
    else:
        threading.Thread(target=run, kwargs={"app":webpage, "host":"localhost", "port":8083, "debug":True}).start()
    subprocess.run(argv)