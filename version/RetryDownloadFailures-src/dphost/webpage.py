import io
import json
import mimetypes
import os
import shutil
import socket
import subprocess
import sys
import tempfile
import threading
import webbrowser
import config
from socketserver import ThreadingMixIn
from wsgiref.simple_server import WSGIRequestHandler, WSGIServer, make_server
from datetime import date, datetime, timezone
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
        ServerAdapter,
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


def _static_content_type(filename):
    lower_name = str(filename).lower()
    if lower_name.endswith((".js", ".mjs")):
        return JS_MIME_TYPE
    if lower_name.endswith(".css"):
        return CSS_MIME_TYPE
    if lower_name.endswith(".svg"):
        return SVG_MIME_TYPE
    if lower_name.endswith((".json", ".geojson", ".map")):
        return "application/json"

    guessed_mimetype, _ = mimetypes.guess_type(lower_name)
    return guessed_mimetype or "application/octet-stream"


class _ThreadingWSGIServer(ThreadingMixIn, WSGIServer):
    daemon_threads = True


class _ThreadingWSGIServerIPv6(_ThreadingWSGIServer):
    address_family = socket.AF_INET6


class ThreadedWSGIRefServer(ServerAdapter):
    """Threaded WSGIRef adapter so concurrent upload/unzip requests do not serialize."""

    def run(self, handler):
        host = self.host or ""
        server_class = _ThreadingWSGIServerIPv6 if ':' in host else _ThreadingWSGIServer

        server = make_server(
            self.host,
            self.port,
            handler,
            server_class=server_class,
            handler_class=self.options.get("handler_class", WSGIRequestHandler),
        )
        server.serve_forever()


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
        wss_response = head(url, timeout=3)
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
            config.get("versionURLs")["versionTxtURL"], timeout=3)
        if version_response.status_code == 200:
            return version_response.text
        return 'Error fetching version information'
    except requests.RequestException as e:
        return 'Error: ' + str(e)


@webpage.get('/getVersionInfoLocal')
def get_version_info_local():
    response.content_type = 'application/json'
    return json.dumps(config.get("versionInformation"))


@webpage.route('/startUp')
def get_startup_info():
    check_version_info()
    redirect('/SSURGOPortalUI')

# get request. Used on initial load. Imediately after initial load a post
# request is issued by ssurgo_portal_scripts.js to get the folder tree.


@webpage.route('/SSURGOPortalUI')
def display_ssurgo_portal_ui():
    # Keep UI-facing version text/cookies in sync even when users load this route directly.
    check_version_info()
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


@webpage.post('/validateDownloadFolder')
def validate_download_folder():
    payload = request.json if isinstance(request.json, dict) else {}
    location = payload.get('location')
    return json.dumps(_validate_download_folder(location))


@webpage.post('/preflightDownload')
def preflight_download():
    payload = request.json if isinstance(request.json, dict) else {}
    location = payload.get('location')
    min_free_disk_mb = payload.get('minFreeDiskMb')
    min_available_memory_mb = payload.get('minAvailableMemoryMb')
    return json.dumps(
        _run_download_preflight(
            location,
            min_free_disk_mb=min_free_disk_mb,
            min_available_memory_mb=min_available_memory_mb,
        )
    )


@webpage.get('/defaultDownloadFolder')
def default_download_folder():
    return json.dumps(_get_default_download_folder())


@webpage.get('/runtimeTelemetry')
def runtime_telemetry():
    response.content_type = 'application/json'
    return json.dumps(_collect_runtime_telemetry())


@webpage.post('/createDownloadFolder')
def create_download_folder():
    payload = request.json if isinstance(request.json, dict) else {}
    parent = payload.get('parent')
    folder_name = payload.get('folderName')
    return json.dumps(_create_download_folder(parent, folder_name))


def _validate_download_folder(location):
    """Validate that a download target exists and is writable."""
    if not isinstance(location, str) or not location.strip():
        return {
            "success": False,
            "message": "Download folder is empty. Select a destination folder."
        }

    normalized_location = os.path.abspath(location.strip())
    if _is_root_folder(normalized_location):
        return {
            "success": False,
            "message": (
                "The root of a drive/filesystem is not a valid download "
                "target. Choose a writable subfolder."
            )
        }

    if not os.path.exists(normalized_location):
        return {
            "success": False,
            "message": f"Download folder does not exist: {normalized_location}"
        }

    if not os.path.isdir(normalized_location):
        return {
            "success": False,
            "message": (
                f"Download location is not a folder: {normalized_location}"
            )
        }

    probe_path = None
    try:
        descriptor, probe_path = tempfile.mkstemp(
            prefix='.__ssurgo_write_test_',
            dir=normalized_location,
        )
        os.close(descriptor)
    except OSError as ex:
        return {
            "success": False,
            "message": (
                f"Download folder is not writable: {normalized_location}. "
                f"{ex}"
            )
        }
    finally:
        if probe_path and os.path.exists(probe_path):
            try:
                os.remove(probe_path)
            except OSError:
                pass

    return {"success": True, "path": normalized_location}


def _coerce_positive_int(value, default_value):
    try:
        parsed = int(value)
        if parsed > 0:
            return parsed
    except (TypeError, ValueError):
        pass

    return default_value


def _run_download_preflight(
    location,
    min_free_disk_mb=4096,
    min_available_memory_mb=1024,
):
    normalized_min_disk_mb = _coerce_positive_int(min_free_disk_mb, 4096)
    normalized_min_memory_mb = _coerce_positive_int(
        min_available_memory_mb,
        1024,
    )

    path_validation = _validate_download_folder(location)
    if not path_validation.get('success'):
        return {
            'success': False,
            'message': path_validation.get('message'),
            'checks': {
                'pathWritable': False,
                'diskEnough': False,
                'memoryEnough': False,
            },
        }

    normalized_location = path_validation.get('path')
    disk_usage = shutil.disk_usage(normalized_location)
    disk_free_mb = round(disk_usage.free / (1024 * 1024), 2)
    disk_enough = disk_free_mb >= normalized_min_disk_mb

    memory_available_mb = None
    memory_enough = True
    memory_check_skipped = False
    memory_message = None

    try:
        import psutil

        memory_available_mb = round(
            psutil.virtual_memory().available / (1024 * 1024),
            2,
        )
        memory_enough = memory_available_mb >= normalized_min_memory_mb
    except (
        ImportError,
        OSError,
        AttributeError,
        RuntimeError,
        TypeError,
        ValueError,
    ) as ex:
        memory_check_skipped = True
        memory_message = f'Unable to collect memory telemetry: {ex}'

    success = disk_enough and memory_enough

    messages = []
    if not disk_enough:
        messages.append(
            (
                'Insufficient disk space. '
                f'Required {normalized_min_disk_mb} MB, '
                f'available {disk_free_mb} MB.'
            )
        )
    if not memory_enough:
        messages.append(
            (
                'Insufficient available memory. '
                f'Required {normalized_min_memory_mb} MB, '
                f'available {memory_available_mb} MB.'
            )
        )
    if memory_check_skipped and memory_message:
        messages.append(memory_message)

    if not messages:
        messages.append('Preflight checks passed.')

    return {
        'success': success,
        'path': normalized_location,
        'message': ' '.join(messages),
        'checks': {
            'pathWritable': True,
            'diskEnough': disk_enough,
            'diskFreeMb': disk_free_mb,
            'diskThresholdMb': normalized_min_disk_mb,
            'memoryEnough': memory_enough,
            'memoryAvailableMb': memory_available_mb,
            'memoryThresholdMb': normalized_min_memory_mb,
            'memoryCheckSkipped': memory_check_skipped,
        },
    }


def _create_download_folder(parent_location, folder_name):
    """Create a new child folder under a validated parent folder."""
    if not isinstance(parent_location, str) or not parent_location.strip():
        return {
            "success": False,
            "message": (
                "Select a parent folder before creating a new folder."
            )
        }

    normalized_parent = os.path.abspath(parent_location.strip())
    if not os.path.exists(normalized_parent):
        return {
            "success": False,
            "message": f"Parent folder does not exist: {normalized_parent}"
        }

    if not os.path.isdir(normalized_parent):
        return {
            "success": False,
            "message": f"Parent location is not a folder: {normalized_parent}"
        }

    normalized_folder_name, validation_message = (
        _validate_new_folder_name(folder_name)
    )
    if not normalized_folder_name:
        return {
            "success": False,
            "message": validation_message,
        }

    target_path = os.path.abspath(
        os.path.join(normalized_parent, normalized_folder_name))
    try:
        common_path = os.path.commonpath([
            normalized_parent,
            target_path,
        ])
        if common_path != normalized_parent:
            return {
                "success": False,
                "message": (
                    "Folder name must stay within the selected parent folder."
                )
            }
    except ValueError:
        return {
            "success": False,
            "message": (
                "Folder name must stay within the selected parent folder."
            )
        }

    if os.path.exists(target_path):
        return {
            "success": False,
            "message": f"Folder already exists: {target_path}"
        }

    try:
        os.makedirs(target_path, exist_ok=False)
    except OSError as ex:
        return {
            "success": False,
            "message": f"Unable to create folder: {ex}"
        }

    validation = _validate_download_folder(target_path)
    if validation.get('success'):
        return {
            "success": True,
            "path": validation.get('path', target_path),
            "message": (
                f"Created folder: {validation.get('path', target_path)}"
            )
        }

    return validation


def _validate_new_folder_name(folder_name):
    if not isinstance(folder_name, str) or not folder_name.strip():
        return (
            None,
            "Folder name is empty. Enter a name before creating the folder.",
        )

    normalized_name = folder_name.strip()
    if normalized_name in ('.', '..'):
        return None, "Folder name is invalid."

    if (
        '/' in normalized_name
        or '\\' in normalized_name
        or '\x00' in normalized_name
    ):
        return (
            None,
            "Folder name cannot include path separators or null characters.",
        )

    if os.name == 'nt':
        invalid_chars = '<>:"/\\|?*'
        if any(char in invalid_chars for char in normalized_name):
            return None, "Folder name contains invalid characters for Windows."

        if normalized_name.rstrip(' .') != normalized_name:
            return None, "Folder name cannot end with a space or period."

        if _is_reserved_windows_name(normalized_name):
            return None, "Folder name is reserved by Windows."

    return normalized_name, None


def _is_reserved_windows_name(folder_name):
    reserved_names = {
        'CON', 'PRN', 'AUX', 'NUL',
        'COM1', 'COM2', 'COM3', 'COM4', 'COM5', 'COM6', 'COM7', 'COM8', 'COM9',
        'LPT1', 'LPT2', 'LPT3', 'LPT4', 'LPT5', 'LPT6', 'LPT7', 'LPT8', 'LPT9',
    }
    return folder_name.split('.')[0].upper() in reserved_names


def _is_root_folder(path):
    normalized_path = os.path.abspath(path)
    if normalized_path == os.path.abspath(os.sep):
        return True

    drive, drive_tail = os.path.splitdrive(normalized_path)
    if drive and drive_tail in ('\\', '/'):
        return True

    return False


def _get_default_download_folder():
    """Resolve a safe, writable default download folder."""
    home_dir = os.path.expanduser('~')
    candidates = []

    if home_dir and home_dir != '~':
        candidates.append(os.path.join(home_dir, 'Downloads', 'SSURGO'))
        candidates.append(os.path.join(home_dir, 'Documents', 'SSURGO'))

    candidates.append(os.path.join(os.getcwd(), 'SSURGO_Downloads'))

    for candidate in candidates:
        try:
            os.makedirs(candidate, exist_ok=True)
        except OSError:
            continue

        validation = _validate_download_folder(candidate)
        if validation.get('success'):
            return {
                'success': True,
                'path': validation['path'],
            }

    return {
        'success': False,
        'message': 'Unable to determine a writable default download folder.'
    }


def _collect_runtime_telemetry():
    telemetry = {
        'success': True,
        'timestampUtc': (
            datetime.now(timezone.utc)
            .isoformat(timespec='seconds')
            .replace('+00:00', 'Z')
        ),
        'pid': os.getpid(),
        'pythonVersion': (
            f"{sys.version_info.major}."
            f"{sys.version_info.minor}."
            f"{sys.version_info.micro}"
        ),
        'platform': sys.platform,
    }

    try:
        import psutil

        virtual_memory = psutil.virtual_memory()
        process_info = psutil.Process(os.getpid())
        process_memory = process_info.memory_info()

        telemetry.update({
            'cpuPercent': round(psutil.cpu_percent(interval=0.1), 2),
            'memoryPercent': round(float(virtual_memory.percent), 2),
            'memoryUsedMb': round(virtual_memory.used / (1024 * 1024), 2),
            'memoryAvailableMb': round(virtual_memory.available / (1024 * 1024), 2),
            'processRssMb': round(process_memory.rss / (1024 * 1024), 2),
        })
    except (ImportError, OSError, AttributeError, RuntimeError, TypeError, ValueError) as ex:
        telemetry['success'] = False
        telemetry['message'] = f'Unable to collect psutil telemetry: {ex}'

    return telemetry


@webpage.post('/uploadBlob')
def upload_blob():
    """Save zip content from browser memory to disk."""

    filename = request.forms.filename
    location = request.forms.location
    overwrite = request.forms.overwrite
    upload = request.files.get('file')
    if not upload:
        return json.dumps(
            {"success": False, "message": "No file was provided."})

    filepath = filename

    if location:
        filepath = os.path.join(location, filename)

    result = _save_upload_stream(upload.file, filepath, overwrite == "1")
    return json.dumps(result)


def _save_upload_stream(upload_stream, filepath, overwrite):
    """Write an uploaded file stream to disk and close temp handles."""
    write_mode = 'wb' if overwrite else 'xb'

    try:
        with open(filepath, write_mode) as f:
            upload_stream.seek(0)
            shutil.copyfileobj(upload_stream, f, length=16 * 1024 * 1024)
    except FileExistsError:
        # If overwrite is off and the zip already exists, treat as reusable.
        return {
            "success": True,
            "alreadyExists": True,
            "message": "File already exists; reusing existing archive."
        }
    except OSError as ex:
        return {
            "success": False,
            "message": f"Failed to write file: {ex}"
        }
    finally:
        # Bottle stores uploads in temporary files; close them promptly.
        try:
            upload_stream.close()
        except OSError:
            pass

    return {"success": True}


def _can_extractall_without_overwrite(zip_ref, location):
    """Return True when archive roots are absent and extractall is safe."""
    root_entries = set()
    for member in zip_ref.infolist():
        normalized_name = member.filename.replace('\\', '/')
        parts = [part for part in normalized_name.split('/') if part]
        if parts:
            root_entries.add(parts[0])

    if not root_entries:
        return True

    return all(
        not os.path.exists(os.path.join(location, entry))
        for entry in root_entries
    )


@webpage.post('/uncompress')
def uncompress():

    location = request.forms.location
    overwrite = request.forms.overwrite
    file = request.forms.file

    if file:
        archive_path = os.path.join(location, file)

        if (not os.path.exists(archive_path)):
            return json.dumps(
                {"success": False, "message": "File doesn't exist."})

        if not is_zipfile(archive_path):
            return json.dumps(
                {"success": False, "message": "File is not a zip file."})

        with ZipFile(archive_path, "r") as zip_ref:
            if overwrite == "1" or _can_extractall_without_overwrite(zip_ref, location):
                zip_ref.extractall(location)
            else:
                for member in zip_ref.infolist():
                    file_path = os.path.join(location, member.filename)
                    if not os.path.exists(file_path):
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
    # Keep /close as a benign endpoint; do not close std streams in packaged mode.
    print("KILL SERVER COMMAND")
    return None


@webpage.get('/serverStatus')
def is_server_running():
    if not getattr(is_server_running, "first_run", True):
        sleep(2)
    is_server_running.first_run = False
    return None

# Checks if a file already exists & returns a boolean


@webpage.post('/fileExists')
def file_exists():
    if isinstance(request.json, list):
        requested_folders = request.json
    elif isinstance(request.json, str):
        requested_folders = [request.json]
    else:
        requested_folders = []

    failed_folders = _find_missing_folders(requested_folders)
    return json.dumps({"failedfolders": failed_folders})


def _find_missing_folders(requested_folders):
    failed_folders = []
    for folder in requested_folders:
        if not isinstance(folder, str):
            failed_folders.append(folder)
            continue

        normalized_folder = folder.strip()
        if not normalized_folder:
            failed_folders.append(folder)
            continue

        try:
            if not os.path.exists(normalized_folder):
                failed_folders.append(folder)
        except (OSError, TypeError, ValueError):
            failed_folders.append(folder)

    return failed_folders

# Returns static files like JS and CSS


@webpage.route('/static/<filename>')
def server_static(filename):
    if config.isPyzFile:
        with ZipFile(zippath) as dpzip:
            try:
                payload = dpzip.read('resources/' + filename)
            except KeyError:
                response.status = 404
                return ''

        response.content_type = _static_content_type(filename)
        return payload
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
        pyz_root = os.path.dirname(os.path.abspath(sys.argv[0]))
        return static_file("sapoly.geojson", root=pyz_root)
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
def get_nested_uswds_image(iconType, filename):
    if config.isPyzFile:
        response.body = render_template(
            f'resources/uswds/images/{iconType}/{filename}')
        response.content_type = SVG_MIME_TYPE
        return response
    return static_file(
        filename,
        fullPath +
        "/resources/uswds/images/" +
        iconType,
        SVG_MIME_TYPE)


@webpage.route('/uswds/fonts/<fontFolder>/<filename>')
def get_font(fontFolder, filename):
    if config.isPyzFile:
        with ZipFile(zippath) as dpzip:
            font_resource = f"resources/uswds/fonts/{fontFolder}/{filename}"
            with dpzip.open(font_resource) as font_result:
                font_bytes = font_result.read()
        extension = os.path.splitext(filename)[1].lower()
        font_mime_types = {
            ".woff": "font/woff",
            ".woff2": "font/woff2",
            ".ttf": "font/ttf",
            ".otf": "font/otf",
        }
        response.content_type = font_mime_types.get(
            extension, "application/octet-stream")
        return font_bytes
    return static_file(
        filename,
        fullPath +
        "/resources/uswds/fonts/" +
        fontFolder)

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
    bind_host = _resolve_bind_host()
    startup_url = _build_startup_url(bind_host)

    # Keep server in the main thread so the process remains alive after startup.
    threading.Thread(
        target=webbrowser.open,
        args=[
            startup_url,
            1,
            True],
        daemon=True).start()

    if config.isPyzFile:
        run(app=webpage, host=bind_host, port=8083, server=ThreadedWSGIRefServer)
    else:
        run(
            app=webpage,
            host=bind_host,
            port=8083,
            debug=True,
            server=ThreadedWSGIRefServer,
        )


def run_server_debugging(argv):
    threading.Thread(target=subprocess.run, args=[argv], kwargs={"check": False}, daemon=True).start()

    bind_host = _resolve_bind_host()
    if config.isPyzFile:
        run(app=webpage, host=bind_host, port=8083)
    else:
        run(app=webpage, host=bind_host, port=8083, debug=True)


def _build_startup_url(bind_host: str) -> str:
    host_for_url = bind_host
    if ':' in bind_host and not bind_host.startswith('['):
        host_for_url = f'[{bind_host}]'
    return f'http://{host_for_url}:8083/startUp'


def _resolve_bind_host() -> str:
    """Bind to the local localhost family used on this machine (IPv6 or IPv4)."""
    try:
        addresses = socket.getaddrinfo("localhost", 8083, socket.AF_UNSPEC, socket.SOCK_STREAM)
        for family, _, _, _, sockaddr in addresses:
            if family == socket.AF_INET6:
                return sockaddr[0]
        for family, _, _, _, sockaddr in addresses:
            if family == socket.AF_INET:
                return sockaddr[0]
    except Exception:
        pass
    return "127.0.0.1"
