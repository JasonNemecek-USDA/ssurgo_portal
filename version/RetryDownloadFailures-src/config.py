# config.py

import sys
from platform import system
from runmode import RunMode
from copy import deepcopy
# Run-time configuration values
# Defined as a plain old module.
if sys.argv[0].endswith('.pyz'):
    isPyzFile = True
else:
    isPyzFile = False

osType = system()

static_config = {
    # Cache the logging mode here
    "runmode" : RunMode.UNDEFINED,

    # Should SSURGO Portal UI requests be checked for schema conformance?
    "checkDpRequestsAgainstSchema": True,

    #Flag to check if PROJ_LIB is defeined. Should only need to do a check the first time checkEmptyShapefiles() is called.
    "checkProjLib" : True,

    #Values for supported Python Versions. This must be in chronological order.
    "supportedPythonVersions": ("3.9", "3.10", "3.11"),
    
    # Required libraries are installed from stored "wheel" files or
    # across the internet. In this version the wheel is used only for GDAL.

    # Relative path to GDAL Wheel for one-time installation - Python version dependent
    # The following choices are only relevant for: (as reported by os.environ)
    #   PROCESSOR_ARCHITECTURE=AMD64
    #   OS=Windows_NT
    # The list can be expanded subject to Wheel availability and os detection.
    "gdalWheel": {
        '3.9': 'python_libraries/GDAL-3.3.3-cp39-cp39-win_amd64.whl',
        '3.10': 'python_libraries/GDAL-3.4.2-cp310-cp310-win_amd64.whl',
        '3.11': 'python_libraries/GDAL-3.4.3-cp311-cp311-win_amd64.whl'
    },

    # Internet library names are presented in a list.
    "installLibrariesViaInternet": ['bottle', 'jsonschema', 'requests', 'dbf', 'numpy', 'psutil', 'pandas'],
    
    # Relative path to empty database templates and appropriate suffix for new files.
    "emptyTemplates": {
        'GeoPackage': 
            {"path": "templates/geopackage.gpkg", "suffix": '.gpkg', "textTemplate": False},
        'SpatiaLite': 
            {"path": "templates/spatialite.sqlite", "suffix": '.sqlite', "textTemplate": False},        
        'GeoPackage (for SSURGO from NASIS or Staging)': 
            {"path": "templates/geopackage_textkey.gpkg", "suffix": '.gpkg', "textTemplate": True},
        'SpatiaLite (for SSURGO from NASIS or Staging)': 
            {"path": "templates/spatialite_textkey.sqlite", "suffix": '.sqlite', "textTemplate": True}
    },

    "versionInformation": {
        'ApplicationVersion': '1.0.0.110', # Updated from default development version to a real portal version for local testing.
        'SQLiteSSURGOTemplateVersion': '1.0.0', #Needs to be manually updated by a developer (doesn't change often). All templates will have the same version. This is the version number of the SQLiteSSURGOTemplate that's included in the Project.
        'SSURGOVersion': '2.3.3' #Needs to be manually updated by a developer (doesn't change often). This is the SSURGO database model version used to create the SSURGO template database schema. This value needs to match what we have in the 'systemtemplateinformation' table inside the template database. This version also aligns with the version.txt file inside Tabular folders. 
    },

    "versionURLs": {
        'SSURGOPortalURL': 'https://websoilsurvey.sc.egov.usda.gov/DSD/Download/SsurgoPortal/SSURGO_Portal.zip',
        'versionTxtURL': 'https://websoilsurvey.sc.egov.usda.gov/DSD/Download/SsurgoPortal/version.txt'
    },


    #Feature flags
    
    #This is a flag that should always be disabled. There is logic within the SDVEngine and dataloader that does not serve any meaningful purpose when SDV logic 
    #is executed through SSURGO Portal. In the event that this same logic is used within other apps such as WSS, we will use these locations to find where we may need
    #to use an mukey list to prevent unrelated data from being included in the rating method.
    "disableMukeyWhereClause": True,

    #Flag to turn on printing of times it takes to run different functions of the application.
    "enableTimeTrials": False,

    # Retry controls for SSURGO bulk download unzip/download failures.
    "bulkDownloadRetryAttempts": 3,
    "bulkDownloadRetryDelaySeconds": 20,

    # Cap concurrent survey downloads to improve throughput consistency.
    "bulkDownloadMaxThreads": 8
}

dynamic_config = deepcopy(static_config)

def reset():
    global static_config
    global dynamic_config
    dynamic_config = deepcopy(static_config)

def get(key):
    global dynamic_config
    return dynamic_config[key]

def set(key, value):
    global dynamic_config
    dynamic_config[key] = value

#Define environment variables
dev_links = {
    "sdaUrl" :              "https://SDMDataAccess-dev-aws.dev.sc.egov.usda.gov/"
    ,"sdaPostRestUrl" :     "https://SDMDataAccess-dev-aws.dev.sc.egov.usda.gov/Tabular/post.rest"
    ,"wssUrl" :             "https://websoilsurvey-dev-aws.dev.sc.egov.usda.gov/"
    ,"wssDownloadUrl" :     "https://websoilsurvey-dev-aws.dev.sc.egov.usda.gov/DSD/Download/Cache/SSA/"
    ,"sapolyDownloadUrl" :  "https://websoilsurvey-dev-aws.dev.sc.egov.usda.gov/DSD/Download/SsurgoPortal/sapoly.geojson"
}

#Commented out as we do not have a diag environment in aws, but may in the future.
#diag_links = {
#    "sdaUrl" :              "https://SDMDataAccess-diag-aws.dev.sc.egov.usda.gov/"
#    ,"sdaPostRestUrl" :     "https://SDMDataAccess-diag-aws.dev.sc.egov.usda.gov/Tabular/post.rest"
#    ,"wssUrl" :             "https://websoilsurvey-diag-aws.dev.sc.egov.usda.gov/"
#    ,"wssDownloadUrl" :     "https://websoilsurvey-diag-aws.dev.sc.egov.usda.gov/DSD/Download/Cache/SSA/"
#    ,"sapolyDownloadUrl" :  "https://websoilsurvey-diag-aws.dev.sc.egov.usda.gov/DSD/Download/SsurgoPortal/sapoly.geojson"
#}

test_links = {
    "sdaUrl" :              "https://SDMDataAccess-test-aws.cert.sc.egov.usda.gov/"
    ,"sdaPostRestUrl" :     "https://SDMDataAccess-test-aws.cert.sc.egov.usda.gov/Tabular/post.rest"
    ,"wssUrl" :             "https://websoilsurvey-test-aws.cert.sc.egov.usda.gov/"
    ,"wssDownloadUrl" :     "https://websoilsurvey-test-aws.cert.sc.egov.usda.gov/DSD/Download/Cache/SSA/"
    ,"sapolyDownloadUrl" :  "https://websoilsurvey-test-aws.cert.sc.egov.usda.gov/DSD/Download/SsurgoPortal/sapoly.geojson"
}

prod_links = {
    "sdaUrl" :              "https://SDMDataAccess.sc.egov.usda.gov/"
    ,"sdaPostRestUrl" :     "https://SDMDataAccess.sc.egov.usda.gov/Tabular/post.rest"
    ,"wssUrl" :             "https://websoilsurvey.sc.egov.usda.gov/"
    ,"wssDownloadUrl" :     "https://websoilsurvey.sc.egov.usda.gov/DSD/Download/Cache/SSA/"
    ,"sapolyDownloadUrl" :  "https://websoilsurvey.sc.egov.usda.gov/DSD/Download/SsurgoPortal/sapoly.geojson"
}

#This ensures that the env doesn't accidently get set to a lower environment when built by our pipeline.
#Change the else variable when using local debugging.
env = prod_links if get("versionInformation")["ApplicationVersion"] != "0.0.0.0" else prod_links 

set('wssUrl', env["wssUrl"])
set("wssDownloadUrl", env["wssDownloadUrl"])
set('sdaUrl', env["sdaUrl"])
set('sdaPostRestUrl', env['sdaPostRestUrl'])
set("sapolyDownloadUrl", env["sapolyDownloadUrl"])