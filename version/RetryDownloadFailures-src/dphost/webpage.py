import io
import json
import os
import subprocess
import sys
import threading
import webbrowser
import config
from datetime import date
from zipfile import ZipFile, is_zipfile
from dlcore import dispatch
from dlcore.SSURGODownloader import BulkDownloader
from time import sleep
from template_logger import tlogger

if config.isPyzFile:
    ssurgo_portal_ui = 'resources/ssurgo_portal_UI.html'
else:
    fullPath = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
    ssurgo_portal_ui = os.path.join(
        fullPath, 'resources', 'ssurgo_portal_UI.html')

try:
    from bottle import (
        Bottle,
        TEMPLATES,
        redirect,
        request,
        response,
        run,
        static_file,
        template,
    )
    import requests
except ImportError as ex:
    raise RuntimeError(f"Missing required runtime dependency: {ex}") from ex

webpage = Bottle()
JS_MIME_TYPE = "text/javascript"
CSS_MIME_TYPE = "text/css; charset=UTF-8"
SVG_MIME_TYPE = "image/svg+xml"
RESOURCE_SUFFIX = "/resources/"
# Logic to process template files from a PYZ file.
if config.isPyzFile:
    # PYZ variables.
    tail = '\\dphost\\webpage.py'
    zippath = __file__[0:(len(__file__) - len(tail))]

    def render_template(file_path):
        """Read template content from the packaged PYZ archive."""
        with ZipFile(zippath) as dpzip:
            with io.TextIOWrapper(
                dpzip.open(file_path),
                encoding='utf-8',
            ) as templateResult:
                content = templateResult.readlines()
                plaintext = ''.join(content)
        # Return plaintext so Bottle does not evaluate template directives in
        # static content.
        return plaintext


def default_converter(o):
    """Converts a date time into a more user friendly format"""
    if isinstance(o, date):
        return o.isoformat()


# ----------------------------------- Bottle Route methods -------------------
@webpage.route('/tlogger/<logmsg>')
def post_log(logmsg):
    msg_type, _, msg_txt = logmsg.partition(':')
    if msg_type == 'debug':
        tlogger.debug(msg_txt)
    elif msg_type == 'warning':
        tlogger.warning(msg_txt)
    elif msg_type == 'error':
        tlogger.error(msg_txt)
    elif msg_type == 'critical':
        tlogger.critical(msg_txt)
    # Gets both 'info' messages and any incorrectly formatted msgTypes.
    else:
        tlogger.info(msg_txt or logmsg)


@webpage.get('/checkInternet')
def check_internet_connection() -> dict:
    """Check internet access to WSS and return status payload."""
    from requests import (
        ConnectionError as RequestsConnectionError,
        HTTPError,
        head,
    )
    url = config.get('wssUrl') + "app/"
    try:
        wss_response = head(url, timeout=5)
        result_payload = {
            'status': True if wss_response.status_code == 200 else False,
            'wss_status_code': wss_response.status_code,
            'message': (
                'Host is able to communicate with WSS'
                if wss_response.status_code == 200
                else 'Host is unable to communicate with WSS'
            ),
            'url': wss_response.url,
        }
        return result_payload
    except HTTPError as e:
        message = "HTTPError error, unable to communicate with WSS."
        tlogger.error(message + "\n" + str(e))
        result_payload = {
            'status': False,
            'wss_status_code': 400,
            'message': message,
            'errormessage': str(e),
        }
        return result_payload
    except RequestsConnectionError as e:
        message = (
            "Connection error, unable to communicate with WSS. "
            "User may be disconnected from the internet."
        )
        tlogger.error(message + '\n' + str(e))
        result_payload = {
            'status': False,
            'status_code': 500,
            'message': message,
            'errormessage': str(e),
        }
        response.status = 500
        return result_payload
    except requests.RequestException as e:
        message = (
            "Unknown error, unable to communicate with WSS. "
            "User may be disconnected from the internet."
        )
        tlogger.error(message + '\n' + str(e))
        result_payload = {
            'status': False,
            'status_code': 500,
            'message': message,
            'errormessage': str(e),
        }
        response.status = 500
        return result_payload


@webpage.get('/SSURGOPortalURL')
def get_ssurgo_portal_url():
    return config.get("versionURLs")["SSURGOPortalURL"]


@webpage.route('/getVersion')
def get_version():
    # Errors might be due to no internet connection, server being down,
    # version.txt missing, etc.
    try:
        version_response = requests.get(
            config.get("versionURLs")["versionTxtURL"], timeout=10)
        if version_response.status_code == 200:
            return version_response.text
        else:
            response.status = 500
            return 'Error fetching version information'
    except requests.RequestException as e:
        response.status = 500
        return 'Error: ' + str(e)


@webpage.route('/startUp')
def get_startup_info():
    check_version_info()
    redirect('/SSURGOPortalUI')

# get request. Used on initial load. Imediately after initial load a post
# request is issued by ssurgo_portal_scripts.js to get the folder tree.


@webpage.route('/SSURGOPortalUI')
def display_ssurgo_portal_ui():
    if config.isPyzFile:
        rendered_ssurgo_portal_ui = render_template(ssurgo_portal_ui)
        return rendered_ssurgo_portal_ui
    else:
        return static_file(
            os.path.basename(ssurgo_portal_ui),
            root=os.path.dirname(ssurgo_portal_ui),
            mimetype='text/html')

# This can also be represented by @route('/start', method = 'post')


@webpage.post('/SSURGOPortalUI')
def ssurgo_portal_ui_request():
    result = dispatch.Dispatch.dispatch(request.json)
    return result


@webpage.post('/bulkssadownload')
def bulkssadownload():
    bulk_downloader = BulkDownloader(request.json)
    result = bulk_downloader.bulkDownload()
    return result


@webpage.post('/uploadBlob')
def upload_blob():
    """Save zip content from browser memory to disk."""

    filename = request.forms.filename
    print(filename)
    location = request.forms.location
    print(location)
    overwrite = request.forms.overwrite
    print(overwrite)
    upload = request.files.get('file')
    if upload:
        print(upload.filename)
    else:
        return json.dumps(
            {"success": False, "message": "No file was provided."})

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


@webpage.post('/uncompress')
def uncompress():

    location = request.forms.location
    print(location)
    overwrite = request.forms.overwrite
    print(overwrite)
    file = request.forms.file
    print(file)

    if file:
        archive_path = os.path.join(location, file)

        if (not os.path.exists(archive_path)):
            return json.dumps(
                {"success": False, "message": "File doesn't exist."})

        if not is_zipfile(archive_path):
            return json.dumps(
                {"success": False, "message": "File is not a zip file."})

        with ZipFile(archive_path, "r") as zip_ref:
            for member in zip_ref.infolist():
                file_path = os.path.join(location, member.filename)
                if (not os.path.exists(file_path)) or (overwrite == "1"):
                    zip_ref.extract(member, location)

        os.remove(archive_path)
        return json.dumps({"success": True,
                           "message": f"{file} extracted to: {location}"})

    return json.dumps({"success": False, "message": "No file was provided."})


@webpage.get('/logFile')
def get_log_file():
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
    if not getattr(is_server_running, "first_run", True):
        sleep(2)
    is_server_running.first_run = False
    return None

# Checks if a file already exists & returns a boolean


@webpage.post('/fileExists')
def file_exists():
    failed_folders = []
    if isinstance(request.json, list):
        requested_folders = request.json
    elif isinstance(request.json, str):
        requested_folders = [request.json]
    else:
        requested_folders = []
    for folder in requested_folders:
        if not os.path.exists(folder):
            failed_folders.append(folder)
    return json.dumps({"failedfolders": failed_folders})

# Returns static files like JS and CSS


@webpage.route('/static/<filename>')
def server_static(filename):
    if config.isPyzFile:
        with ZipFile(zippath) as dpzip:
            with io.TextIOWrapper(
                dpzip.open('resources/' + filename),
                encoding='utf-8',
            ) as templateResult:
                content = templateResult.readlines()
                plaintext = ''.join(content)
            return template(plaintext)
    else:
        return static_file(filename, fullPath + RESOURCE_SUFFIX)

# Returns static files like JS and CSS


@webpage.route('/static/js/<filename>')
def server_static_js(filename):
    if config.isPyzFile:
        with ZipFile(zippath) as dpzip:
            with io.TextIOWrapper(
                dpzip.open('resources/' + filename),
                encoding='utf-8',
            ) as templateResult:
                content = templateResult.readlines()
                plaintext = ''.join(content)
            response.body = plaintext
            response.content_type = JS_MIME_TYPE
            return response
    return static_file(
        filename,
        fullPath + RESOURCE_SUFFIX,
        mimetype=JS_MIME_TYPE)

# Create a route for easier debugging.
# The sapoly.geojson file is outside the PYZ.
# we do not need to worry about specially handling this file.


@webpage.route('/static/sapoly.geojson')
def load_sapoly():
    if config.isPyzFile:
        return static_file("sapoly.geojson", root="./")
    else:
        return static_file("sapoly.geojson", fullPath + RESOURCE_SUFFIX)

# Load sub html components such as the NRCS logo and text


@webpage.route('/static/SubComponents/HtmlComponents/<filename>')
def get_html_components(filename):
    if config.isPyzFile:
        rendered_html_component = render_template(
            'resources/SubComponents/HtmlComponents/' + filename)
        output = template(rendered_html_component)
    else:
        output = static_file(filename, fullPath +
                             '/resources/SubComponents/HtmlComponents/')
    return output

# Load any sub component js items


@webpage.route('/static/SubComponents/JsComponents/<filename>')
def get_html_components_scripts(filename):
    if config.isPyzFile:
        with ZipFile(zippath) as dpzip:
            with io.TextIOWrapper(
                dpzip.open('resources/SubComponents/JsComponents/' + filename),
                encoding='utf-8',
            ) as templateResult:
                content = templateResult.readlines()
                plaintext = ''.join(content)
            response.body = plaintext
            response.content_type = JS_MIME_TYPE
            return response
    return static_file(
        filename,
        fullPath +
        "/resources/SubComponents/JsComponents/",
        mimetype=JS_MIME_TYPE)


@webpage.route('/static/css/<filename>')
def get_css(filename):
    if config.isPyzFile:
        response.body = render_template('resources/css/' + filename)
        response.content_type = CSS_MIME_TYPE
        return response
    return static_file(filename, fullPath + "/resources/css/")

# Returns images. CAN ONLY ACCCEPT SVG FILES.


@webpage.route('/static/images/<filename>')
def get_image(filename):
    if config.isPyzFile:
        response.body = render_template('resources/images/' + filename)
        response.content_type = SVG_MIME_TYPE
        return response
    return static_file(
        filename,
        fullPath +
        "/resources/images/",
        SVG_MIME_TYPE)


@webpage.route('/static/services/<filename>')
def get_services(filename):
    if config.isPyzFile:
        with ZipFile(zippath) as dpzip:
            with io.TextIOWrapper(
                dpzip.open('resources/services/' + filename),
                encoding='utf-8',
            ) as templateResult:
                content = templateResult.readlines()
                plaintext = ''.join(content)
            response.body = plaintext
            response.content_type = JS_MIME_TYPE
            return response
    return static_file(
        filename,
        fullPath +
        "/resources/services/",
        mimetype=JS_MIME_TYPE)


@webpage.route('/static/JsLibrary/<library>/<filename>')
def server_library(library, filename):
    if config.isPyzFile:
        with ZipFile(zippath) as dpzip:
            with io.TextIOWrapper(
                dpzip.open(
                    "resources/SubComponents/JsLibraries/"
                    + library
                    + "/"
                    + filename
                ),
                encoding='utf-8',
            ) as templateResult:
                content = templateResult.readlines()
                plaintext = ''.join(content)
            response.body = plaintext
            response.content_type = JS_MIME_TYPE
            return response
    return static_file(
        filename,
        fullPath +
        "/resources/SubComponents/JsLibraries/" +
        library,
        mimetype=JS_MIME_TYPE)

# Leaflet Routes


@webpage.route('/leaflet/javascript/<filename>')
def get_leaflet_javascript(filename):
    if config.isPyzFile:
        with ZipFile(zippath) as dpzip:
            with io.TextIOWrapper(
                dpzip.open('resources/leaflet/javascript/' + filename),
                encoding='utf-8',
            ) as templateResult:
                content = templateResult.readlines()
                plaintext = ''.join(content)
            return plaintext
    return static_file(filename, fullPath + "/resources/leaflet/javascript/")


@webpage.route("/leaflet/css/<filename>")
def get_leaflet_css(filename):
    if config.isPyzFile:
        response.body = render_template('resources/leaflet/css/' + filename)
        response.content_type = CSS_MIME_TYPE
        return response
    return static_file(filename, fullPath + "/resources/leaflet/css/")

# USWDS Routes


@webpage.route('/uswds/javascript/<filename>')
def server_uswds_javascript(filename):
    if config.isPyzFile:
        with ZipFile(zippath) as dpzip:
            with io.TextIOWrapper(
                dpzip.open('resources/uswds/javascript/' + filename),
                encoding='utf-8',
            ) as templateResult:
                content = templateResult.readlines()
                plaintext = ''.join(content)
            return plaintext
    return static_file(filename, fullPath + "/resources/uswds/javascript/")


@webpage.route("/uswds/css/<filename>")
def get_uswds_css(filename):
    if config.isPyzFile:
        response.body = render_template('resources/uswds/css/' + filename)
        response.content_type = CSS_MIME_TYPE
        return response
    return static_file(filename, fullPath + "/resources/uswds/css/")


@webpage.route('/uswds/img/<filename>')
def get_uswds_image(filename):
    if config.isPyzFile:
        response.body = render_template('resources/uswds/images/' + filename)
        response.content_type = SVG_MIME_TYPE
        return response
    return static_file(
        filename,
        fullPath +
        "/resources/uswds/images/",
        SVG_MIME_TYPE)


@webpage.route('/uswds/img/<iconType>/<filename>')
def get_nested_uswds_image(icon_type, filename):
    if config.isPyzFile:
        response.body = render_template(
            f'resources/uswds/images/{icon_type}/{filename}')
        response.content_type = SVG_MIME_TYPE
        return response
    return static_file(
        filename,
        fullPath +
        "/resources/uswds/images/" +
        icon_type,
        SVG_MIME_TYPE)


@webpage.route('/uswds/fonts/<fontFolder>/<filename>')
def get_font(font_folder, filename):
    if config.isPyzFile:
        with ZipFile(zippath) as dpzip:
            font_resource = f"resources/uswds/fonts/{font_folder}/{filename}"
            with dpzip.open(font_resource) as font_result:
                response.body = font_result.read()
        extension = os.path.splitext(filename)[1].lower()
        font_mime_types = {
            ".woff": "font/woff",
            ".woff2": "font/woff2",
            ".ttf": "font/ttf",
            ".otf": "font/otf",
        }
        response.content_type = font_mime_types.get(
            extension, "application/octet-stream")
        return response
    return static_file(
        filename,
        fullPath +
        "/resources/uswds/fonts/" +
        font_folder)

# Called from __main__.py.


def check_version_info():
    cookie_version = request.get_cookie("ApplicationVersion")
    config_version = config.get("versionInformation")
    if (
        cookie_version is None
        or cookie_version != config_version["ApplicationVersion"]
    ):
        TEMPLATES.clear()
        webpage.reset()
        response.set_cookie(
            "ApplicationVersion",
            config_version["ApplicationVersion"],
            samesite='Strict')
        response.set_cookie(
            "SQLiteSSURGOTemplateVersion",
            config_version["SQLiteSSURGOTemplateVersion"],
            samesite='Strict')
        response.set_cookie(
            "SSURGOVersion",
            config_version["SSURGOVersion"],
            samesite='Strict')
        response.set_cookie("wssUrl", config.get("wssUrl"), samesite='Strict')
        response.set_cookie(
            "wssDownloadUrl",
            config.get("wssDownloadUrl"),
            samesite='Strict')
        response.set_cookie("sdaUrl", config.get("sdaUrl"), samesite='Strict')
        response.set_cookie(
            "sdaPostRestUrl",
            config.get("sdaPostRestUrl"),
            samesite='Strict')


def run_server():
    """Run the Bottle server and open the browser."""
    if config.isPyzFile:
        threading.Thread(
            target=run,
            kwargs={
                "app": webpage,
                "host": "localhost",
                "port": 8083}).start()
    else:
        threading.Thread(
            target=run,
            kwargs={
                "app": webpage,
                "host": "localhost",
                "port": 8083,
                "debug": True}).start()
    threading.Thread(
        target=webbrowser.open,
        args=[
            'http://localhost:8083/startUp',
            1,
            True],
        daemon=True).start()


def run_server_debugging(argv):
    if config.isPyzFile:
        threading.Thread(
            target=run,
            kwargs={
                "app": webpage,
                "host": "localhost",
                "port": 8083}).start()
    else:
        threading.Thread(
            target=run,
            kwargs={
                "app": webpage,
                "host": "localhost",
                "port": 8083,
                "debug": True}).start()
    subprocess.run(argv, check=False)
