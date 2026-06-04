# runmode
# Enum to define the running mode values
# Reference:
#   https://docs.python.org/3/library/enum.html

import enum
from enum import Enum, unique

@unique
class RunMode(Enum):
    # These are listed in expected order of discovery.
    UNDEFINED = "Undefined"
    LIBRARY_INITIALIZATION = 'LibraryInitialization'
    SSURGO_PORTAL_UI = 'SsurgoPortalUi'
    SSURGO_PORTAL_DEBUG_BROWSER = "SsurgoPortalDebugBrowser"
    DATA_LOADER = 'DataLoader'
    GET_USAGE = 'GetUsage'

