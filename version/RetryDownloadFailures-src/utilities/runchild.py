# runchild.py

import sys
import subprocess

class RunChild:
    # Wrapper for subprocess creation and i/o handling

    def pipeReader(p):
        # Strip Windows newlines from non-string data
        # Returns resultant string.
        if isinstance(p, str):
            return p
        else:
            buffer = ''
            while True:
                buffer += p.readline().rstrip('\r\n')
            return buffer

    def runSub(cmd, showVerboseMessage, stdinString=None):
        # Run some command vector in a subprocess, allows message control
        #   cmd: an array of commands and/or arguments
        #   showVerboseMessage:  
        #       if True, shows stdout, stderr, error_code
        #       if false, shows stderr
        #   stdinString: optional stdin text, use None to ignore
        # usage:
        #   (status, message) = runSub(initialMessage, showVerboseMessage, stdinString=None):
        message = ''
        if stdinString is None:
            message += "\nrunSub no stdin used"
            proc = subprocess.Popen(cmd, stdout=subprocess.PIPE,stderr=subprocess.PIPE,
                shell=True, universal_newlines=True)
            stdout,stderr=proc.communicate()
        else:
            message += "\nrunSub stdin used"
            proc = subprocess.Popen(cmd, stdin=subprocess.PIPE, stdout=subprocess.PIPE,stderr=subprocess.PIPE,
                    shell=True, universal_newlines=True)
            stdout,stderr=proc.communicate(input=stdinString)

        exit_code=proc.wait()
        if exit_code: 
            if (showVerboseMessage):
                message += "\ncmd:"
                for c in cmd:
                    message += '\n' + c
                message += "\nstdout: " + RunChild.pipeReader(stdout)
                message += "\nstderr: " + RunChild.pipeReader(stderr)
                message += "\nerror_code: " + str(exit_code)
                if not stdinString is None:
                    message += f"\nstdin: {stdinString}"
                return (False, message)
        else:
            message = RunChild.pipeReader(stdout)

        return (True, message)


