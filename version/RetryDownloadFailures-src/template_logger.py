# template_logger.py 
# A wrapper around generic Python logging
# Usage:
#   Early in application startup, the desired path and filename
#   to the log should be defined.
#       import template_logger
#       import logging
#       template_logger.initializeLogger(filename, logging.DEBUG)
#   where logging is needed,
#       from template_logger import tlogger
#           # In increasing order of severity
#       tlogger.debug("this is a debug message")
#       tlogger.info("help me information")
#       tlogger.warning("this is a warning")
#       tlogger.error("to err is human")
#       tlogger.critical("this is a critical message")
# See https://docs.python.org/3/library/logging.html for details on 
# inclusion of extra parameters in the calls.
# References:
#   https://www.toptal.com/python/in-depth-python-logging
#   https://docs.python.org/3/library/logging.html
#   https://docs.python.org/3/library/logging.handlers.html#module-logging.handlers
#
# There are six log levels in Python; each level is associated with an 
# integer that indicates the log severity: 
# NOTSET=0, DEBUG=10, INFO=20, WARN=30, ERROR=40, and CRITICAL=50.

import logging
from logging.handlers import RotatingFileHandler

tlogger = logging.getLogger(__name__)

def initializeLogger(filename, minimumLevel):
    global tlogger

    # Log to specified handler
    # The filename will get the current run mode interposed before the ".log".
    FORMATTER = logging.Formatter("%(asctime)s -- %(name)s -- %(levelname)s -- %(message)s")
    file_handler = RotatingFileHandler(filename, mode='a', maxBytes=5*1024*1024, backupCount=4) # maxBytes is set to 5MB. 1024*1024 is 1MB.
    file_handler.setFormatter(FORMATTER)

    tlogger.addHandler(file_handler)
    tlogger.setLevel(minimumLevel)
    tlogger.propagate = False
