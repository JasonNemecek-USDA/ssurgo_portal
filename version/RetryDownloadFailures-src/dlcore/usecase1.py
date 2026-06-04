# usecase1.py

import errno
import os
import pathlib
import shutil
import sys
from zipfile import ZipFile
from urllib import response
import config

class UseCase1:

    @staticmethod
    def getExecutionDetails():
        # Are we executing from a root Python or PYZ file?
        # What is the folder hosting our current script?
        # usage: (isPyzScript, argv0, currentPath) = getExecutionDetails()
        argv0 = sys.argv[0]
        p = pathlib.PurePath(argv0)
        return (argv0.endswith('.pyz'), argv0, p.parent)

    @staticmethod
    def getTemplateCatalog():
        # Use Case 1a: getTemplateCatalog
        # Use case 1: "Create a new template database in a folder that I select."
        # Returns JSON containing information about all available empty SSURGO SQLite templates.
        # Use "<script> ?copytemplatefile" to retrieve schemas with request and response fields.

        response = {
                "status": True, 
                "message": "",
                "errormessage": "",
                "emptytemplates": config.get("emptyTemplates")
            }

        return response

    def copyTemplateFile(request):
        # Use Case 1b: copyTemplateFile
        # Use case 1: "Create a new template database in a folder that I select."
        # Copies a template file to a specified folder path and name.
        # Use "<script> ?copytemplatefile" to retrieve schemas with request and response fields.
        templatename = request["templatename"]
        folder = request["folder"]
        filename = request["filename"]
        overwrite = request["overwrite"]

        if templatename in config.get("emptyTemplates"):
            templateRecord = config.get("emptyTemplates")[templatename]
        else:
            response = {"status": False, "message": "Checking templatename", "errormessage": f'invalid templatename: "{templatename}"'}
            return response

        try:
            if not os.path.exists(folder):
                os.mkdir(folder)
        except BaseException as err:
            response = {"status": False, "message": "Creating new folder", "errormessage": f'Unable to create folder "{folder}", err={err}'}
            return response

        fullFilename = os.path.join(folder, filename)
        fullFilename = fullFilename + templateRecord["suffix"]
        if os.path.exists(fullFilename) and not overwrite:
            response = {"status": False, "message": "Checking file existence", 
                "errormessage": f'File already exists "{fullFilename}", will not overwrite'}
            return response
        else:
            if os.path.exists(fullFilename):
                errormessagefragment = 'Unable to overwrite template'
            else:
                errormessagefragment = 'Unable to create new database'

            (isPyzScript, argv0, currentPath) = UseCase1.getExecutionDetails()
            try:
                templateRecordPath = templateRecord["path"]
                if not isPyzScript:
                    templateSource = os.path.join(currentPath, templateRecordPath)
                    shutil.copy(templateSource, fullFilename)
                else:
                    with ZipFile(argv0) as dpzip:
                        # We need a Unix/Linux style path.
                        templateRecordPath = templateRecordPath.replace('\\', '/')
                        with dpzip.open(templateRecordPath) as sqlfile:
                            content = sqlfile.read()
                            f = open(fullFilename, 'wb')
                            f.write(content)
                            f.close()
                    dpzip.close()                             
                response = {"status": True, "message": f"Copied {templateRecordPath} to {fullFilename}", "errormessage": ""}
                return response
            except PermissionError as err:
                response = {"status": False, "message": "", "errormessage": f'{errormessagefragment}. Insufficient permissions to write to "{folder}"'}
                return response
            except OSError as err:
                if err.errno == errno.EINVAL or err.errno == errno.ENOENT:
                    response = {"status": False, "message": "", "errormessage": f'{errormessagefragment}. Invalid character in database name: "{filename}"'}
                else:
                    print(f'Unhandled OSError {err}')
                    response = {"status": False, "message": "", "errormessage": f'{errormessagefragment} "{folder}", err={err}'}
                return response
            except BaseException as err:
                response = {"status": False, "message": "", "errormessage": f'{errormessagefragment} "{folder}", err={err}'}
                return response 
  
