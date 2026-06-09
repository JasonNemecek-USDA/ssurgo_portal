# utilities\initializer.py

from os import path, remove, environ
import platform
import shutil
import sys
import traceback
import zipfile

import config
from .runchild import RunChild
from template_logger import tlogger


# Perform one-time initialization.
# The user will be prompted to quit or continue.
# If continuing then the libraries will be installed.

def askToProceed():
    # Let user know they've a choice.
    # Returns False if quitting, True if proceeding.
    print('''
The Python library needs to be initialized (this is normally a one-time 
operation). You must be connected to the Internet for this operation to 
succeed.''')
    print()
    if environ.get("SSURGO_AUTO_INIT") == "1" or not sys.stdin.isatty():
        tlogger.info('askToProceed: auto-approving initialization')
        print('Auto mode enabled; proceeding with initialization...')
        return True
    response = input('Enter "p" to proceed, anything else to quit: ')
    if response and len(response) >= 1:
        tlogger.info('askToProceed: response == "p"')
        return 'p' == response[0].lower()
    else:
        tlogger.info('askToProceed: response != "p"')
        return False

def notifyCompletion(status: bool, message: str, showVerboseMessage: bool):
    tlogger.info(f'notifyCompletion: status={status}, message={message}')
    if not status:
        print('An error occurred during initialization:')
        print(message)
    else:
        print('The initialization completed without error')
        if showVerboseMessage:
            print(message)

    print()
    if environ.get("SSURGO_AUTO_INIT") == "1" or not sys.stdin.isatty():
        tlogger.info(f'Initialization completed with status={status} (auto mode, no prompt)')
        return
    response = input('Press the "Enter" key to finish the initialization: ')
    tlogger.info(f'Initialization completed with status={status}')

    return

def getPythonVersion():
    ''' Determine current Python version (major.minor).
    Used for identifying required GDAL library wheel.
    Returns tuple (versionString, errorMessage)'''
    pythonVersion = list(platform.python_version_tuple())
    pythonVersion.pop(-1)
    pythonVersion = ".".join(pythonVersion)
    if pythonVersion in config.get("supportedPythonVersions"):
        return(pythonVersion, False)
    else:
        return (pythonVersion, f'Invalid Python version found: {sys.version}')

def installGdalWindows(showVerboseMessage: bool, versionString: str):

    # Identify the Wheel file
    # We assume that the config.py definition uses "/" folder separators for the Whl path.
    whl = (config.get("gdalWheel"))[versionString]
    if config.isPyzFile == True:
        # Case: IN a PYZ, extract the file
        try:
            wfn = whl.split('/').pop()
            tail = 'utilities\\initialize.pyc'
            zippath = __file__[0:(len(__file__) - len(tail)) - 1]
            fileLocation = zippath.split('\\')
            fileLocation.pop()
            fileLocation = '\\'.join(fileLocation)
            fileLocation = path.join(fileLocation, wfn)
            extractMsg = f'installGdal(): extracting GDAL from whl={whl} at zippath={zippath} to fileLocation={fileLocation}'
            tlogger.info(extractMsg)
            if showVerboseMessage: print(extractMsg)
            with zipfile.ZipFile(zippath, mode='r') as archive:
                with archive.open(whl) as whlObject:
                    with open(fileLocation, 'wb') as outfile:
                        shutil.copyfileobj(whlObject, outfile)
        except Exception as e:
            tlogger.critical('Failed to extract GDAL Wheel: ' + str(e))
            tlogger.critical(traceback.format_exc())
            return (False, 'Failed to open GDAL Wheel: ' + str(e))
        cmd = [sys.executable, "-m", "pip", "install", fileLocation]
    else:
        # Case: Not in a PYZ, find the file in its expected location
        scriptLocation = path.dirname(path.abspath(sys.argv[0]))
        whl = path.join(scriptLocation, whl.replace('/', path.sep))
        if not path.isfile(whl):
            errormessage = f'Whl file ({whl}) does not exist'
            tlogger.critical(errormessage,stack_info=True)
            return (False, errormessage)
        cmd = [sys.executable, "-m", "pip", "install", whl]

    # Perform the installation
    try:
        runsubStartMsg = f'Performing runsub with cmd={cmd}'
        if showVerboseMessage: print(runsubStartMsg)
        (status, childMessage) = RunChild.runSub(cmd, showVerboseMessage)
        if status:
            errormessage = "OSGeo (GDAL/OGR) libraries not found, will install for current user" + childMessage
        else:
            errormessage = "Failure installing OSGeo (GDAL/OGR) libraries" + childMessage
            tlogger.critical(errormessage,stack_info=True)
            return (False, errormessage)
    except Exception as e:
        tlogger.critical('Runchild failure: ' + str(e))
        tlogger.critical(traceback.format_exc())
        return (False, 'Runchild failure:  ' + str(e))

    # try listing installation
    try:
        cmd = "pip freeze"
        runsubPipFreezeMsg = f'Performing runsub with cmd={cmd}'
        tlogger.info(runsubStartMsg)
        if showVerboseMessage: print(runsubPipFreezeMsg)
        (status, childMessage) = RunChild.runSub(cmd, showVerboseMessage)
        if status:
            message = "OSGeo (GDAL/OGR) libraries installed"
            if config.isPyzFile == True:
                if path.isfile(fileLocation):
                    try:
                        remove(fileLocation)
                        return (True, message)
                    except Exception as e:
                        errormessage = 'Unexpected error during PYZ GDAL file deletion of {fileLocation}.' + str(e)
                        tlogger.critical(errormessage)
                        tlogger.critical(traceback.format_exc())
                        return (False, errormessage)
                else:
                    errormessage = f'Failure deleting unzipped wheel f{whl}'
                    return (False, errormessage)
            else:
                return (True, message)
        else:
            errormessage = 'Unexpected error during OSGeo (GDAL/OGR) installation.' + childMessage
            tlogger.critical(errormessage,stack_info=True)
            return (False, errormessage)
    except Exception as e:
        tlogger.critical('pip freeze failure: ' + str(e))
        tlogger.critical(traceback.format_exc())
        return (False, 'pip freeze failure:  ' + str(e))

def installGdalUbuntu(showVerboseMessage: bool):
    def installCmd(cmd):
        if cmd == "pip install GDAL":
            (status, message, gdalVersion) = getOgrinfo()
            if status:
                cmd += f'=={gdalVersion}'
            else:
                return(False, message)
        try:
            runsubStartMsg = f'Performing runsub with cmd={cmd}'
            tlogger.info(runsubStartMsg) 
            if showVerboseMessage: print(runsubStartMsg)
            (status, childMessage) = RunChild.runSub(cmd, showVerboseMessage)
            if status:
                errormessage = "{} successfully ran".format(cmd) 
                tlogger.info(errormessage)
                return (True, errormessage)
            else:
                errormessage = "Failure running the {} command".format(cmd) + childMessage
                tlogger.critical(errormessage,stack_info=True)
                return (False, errormessage)
        except Exception as e:
            tlogger.critical('Runchild failure: ' + str(e))
            tlogger.critical(traceback.format_exc())
            return (False, str(e))
        
    def getOgrinfo() -> tuple[bool, str, str]:
        '''To properly install gdal for Ubuntu, we must be able to grab the version that is available in the repository'''
        cmd = "ogrinfo --version"
        try:
            runsubStartMsg = f'Performing runsub with cmd={cmd}'
            tlogger.info(runsubStartMsg) 
            if showVerboseMessage: print(runsubStartMsg)
            (status, gdalVersion) = RunChild.runSub(cmd, showVerboseMessage)
            if status:
                #Format the response from ogrinfo --version to just return the number I.E: 3.6.2
                gdalVersion = gdalVersion.split(", ")
                gdalVersion.pop()
                gdalVersion = "".join(gdalVersion)
                gdalVersion = gdalVersion.split(" ")
                gdalVersion = gdalVersion.pop()
                errormessage = f'{cmd} successfully ran'
                tlogger.info(errormessage)
                tlogger.info("GDAL Version found from repository: " + gdalVersion)
                return(True, errormessage, gdalVersion)
            else:
                errormessage = "Failure retrieving GDAL version from repository: " + gdalVersion
                tlogger.critical(errormessage,stack_info=True)
                return(False, errormessage, "")
        except Exception as e:
            tlogger.critical('Error retrieving ogrinfo: ' + str(e))
            tlogger.critical(traceback.format_exc())
            return(False, str(e), "error")

    #Commands needed to install gdal on a Ubuntu machine
    cmdList = [
        "sudo add-apt-repository ppa:ubuntugis/ppa -y",
        "sudo apt-get install python3-pip -y",
        "sudo apt-get update -y",
        "sudo apt-get install gdal-bin -y",
        "sudo apt-get install libgdal-dev -y",
        "export CPLUS_INCLUDE_PATH=/usr/include/gdal",
        "export C_INCLUDE_PATH=/usr/include/gdal",
        "pip install GDAL"
    ]

    for cmd in cmdList:
        (status, message) = installCmd(cmd)
        if not status: return(status, message)
    return(status, "Successfully intialized Ubuntu GDAL")

def installLibrariesViaInternet(showVerboseMessage):
    installLibrariesViaInternet = config.get("installLibrariesViaInternet")
    if installLibrariesViaInternet:
        librariesToInstall = []
        tlogger.info('installLibrariesViaInternet(): checking for unavailable libraries')
        for libraryName in installLibrariesViaInternet:
            try:
                if libraryName == 'numpy':
                    libraryName += '==1.26.4'
                print(libraryName)
                importStatement = f'import {libraryName}'
                exec(importStatement)
            except Exception as ex:
                librariesToInstall.append(libraryName)

        if librariesToInstall:
            cmd = [sys.executable, "-m", "pip", "install"] + librariesToInstall
            cmd = " ".join(cmd)
            internetInstallStartMsg = f'Installing library(ies) via Internet using cmd={cmd}'
            tlogger.info(internetInstallStartMsg)
            print(internetInstallStartMsg)
            (status, childMessage) = RunChild.runSub(cmd, showVerboseMessage)
            tlogger.info(f"Library installation status: {status}, childMessage={childMessage}")
            if status and not showVerboseMessage:
                print("Libraries installed")
            elif status:
                print(f"Libraries installed, childMessage={childMessage}")
            else:
                errormessage = "Failure installing libraries via Internet" + childMessage
                tlogger.critical(errormessage,stack_info=True)
                return (False, errormessage)

            # try listing installation
            cmd = "pip freeze"
            if showVerboseMessage:
                print("Checking freeze list")
            (status, childMessage) = RunChild.runSub(cmd, showVerboseMessage)
            if status:
                message = f"Freeze list = {childMessage}"
                # Clean up after ourselves
                return (True, message)
            else:
                errormessage = f'Unexpected error during Internet library check, childMessage={childMessage}'
                tlogger.critical(errormessage,stack_info=True)
                return (False, errormessage)

        else:
            noInstallationRequiredMsg = '...no Internet Library installation(s) required'
            tlogger.info(noInstallationRequiredMsg)
            return (True, noInstallationRequiredMsg)

def logSystemInfo() -> tuple[str, str, str]:
    '''Log information about the system to assist in debugging. Returns version, error message and distro'''
    distro = ""
    (versionString, versionErrorMessage) = getPythonVersion()
    tlogger.info("Python Version running: {}".format(versionString))
    tlogger.info("Python executing location: {}".format(sys.executable))
    tlogger.info("Py Python Versions found: {}".format(RunChild.runSub("py -0p", False)))
    path_env = environ.get("PATH")
    if "Python" in path_env:
        path_env = path_env.split(";" if config.osType == "Windows" else ":")
        python_path_env = []
        for item in path_env:
            if "Python" in item:
                python_path_env.append(item)
        tlogger.info(f"Python environment path: {python_path_env}")
    else:
        tlogger.warning("A path with 'Python' was not found in the environment variables")
    if(config.osType == "Windows"):
        #Log information about the windows operating machine
        tlogger.info("Operating System in use: {} {}. Processor type: {}.".format(config.osType, platform.version(), platform.machine()))
    elif(config.osType == "Linux"):
        #Try and get Linux distribution
        try:
            with open("/etc/issue") as f:
                distro = f.read().lower().split()[0]
                f.close()
        except:
            distro = "Unable to find distro file"
        #Log information about the Linux operating machine
        tlogger.info("Operating System in use: {} {}. Processor type: {}.".format(config.osType, distro, platform.machine()))
    else:
        #Attempt to log random operating system types. This code has not been tested.
        tlogger.warning("Operating System is neither Windows nor Linux.")
        distro = "unknown"
        tlogger.info("Operating System in use: {} {}. Processor type: {}.".format(config.osType, distro, platform.machine()))
    return versionString, versionErrorMessage, distro

def performInitialization(showVerboseMessage: bool):
    # Perform initialization
    # Usage: (status, message) = performInitialization

    # Proceed?
    if not askToProceed():
        return (False, "Canceled")

    (versionString, versionErrorMessage, distro) = logSystemInfo()

    #Check to see if the python installation is supported.
    if versionErrorMessage != False:
        #Set message to avoid an Unbound Error
        message = versionErrorMessage
        tlogger.debug(versionErrorMessage)
        unsupported_message = (
            "The executing version of Python {} is not currently supported by SSURGO Portal. "
            "The supported versions are between {} and {}."
        ).format(versionString, config.get("supportedPythonVersions")[0], config.get("supportedPythonVersions")[-1])
        if environ.get("SSURGO_AUTO_INIT") == "1" or not sys.stdin.isatty():
            print(unsupported_message)
        else:
            input(unsupported_message + " Press Enter to continue.")
        return (False, versionErrorMessage)
    # Install GDAL wheel if needed
    # Usage: (status, message) = installGdal(True/False)

    # If import works then we do not need to install the GDAL wheel.
    try:
        from osgeo import ogr, osr, gdal
        status = True
    except:
    # GDAL not installed. 
        if(config.osType == "Windows"):
        # Initialize GDAL library from the stored wheel for Windows.
            (status, message) = installGdalWindows(showVerboseMessage, versionString)
        
        elif(config.osType == "Linux"):
        #Initialize GDAL Library for Ubuntu
            if(distro == "ubuntu"):
                (status, message) = installGdalUbuntu(showVerboseMessage)
            else:
                status = True
                message = """Your Linux Distribution: {}, is not supported to automatically install GDAL. In order for SSURGO Portal to run properly, you must 
                install this library independently. All other libraries will be installed. Press Enter to continue.""".format(distro)
                tlogger.warning(message)
                if environ.get("SSURGO_AUTO_INIT") == "1" or not sys.stdin.isatty():
                    print(message)
                else:
                    input(message)
        else:
            return(False, "You are running an unsupported operating system.")
    # Initialize libraries from Internet
    if status:
        (status, message2) = installLibrariesViaInternet(showVerboseMessage)
        try:
            message = message + '\n' + message2
        except NameError:
            message = message2

    notifyCompletion(status, message, showVerboseMessage)