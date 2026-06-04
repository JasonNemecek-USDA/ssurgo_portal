# package_files.py
# Create Python Zip file with a root __main__.py 
# and contents of specified folder tree.
# Usage:
#   package_files.py <root of file tree> <file to create>
# For example, if you are executing in the folder above the PYZ file assemblage 
# (located in child folder "pyz") and want to create "test.pyz" in your current 
# location, use
#   package_files.py pyz test.pyz
# Notes: 
#   1. The zip contents starts within the root path.

import os
import sys
from zipfile import ZipFile

def usage():
    text = '''
Usage: package_files.py <root path of file tree> <file to create>
  The "root path" must be a folder and must be specified with a full path.
  The "file to create" is deleted if it exists and is a file, 
  it may include a path specification but must not be at or under 
  the root path.
'''
    print(text)

# Check arguments
if len(sys.argv) != 3:
    usage()
    sys.exit()
elif not os.path.exists(sys.argv[1]) or not os.path.isdir(sys.argv[1]):
    usage()
    sys.exit()
elif not os.path.exists(sys.argv[2]) and os.path.isdir(sys.argv[2]):
    usage()
    sys.exit()

# Perform the zipping of the file tree
# We shift the Python executing environment to the root so that 
# our output file does not have any parent folders in the 
# zip structure.
# Note that the __pycache__ folders are not included.
# Cautions: 
#   1. The PYZ file should not be created under the root path
#      lest you reach recursive purgatory.
#   2. Use a full path for root path.
# 
rootPath = sys.argv[1]
targetFilename = sys.argv[2]
startPath = os.getcwd()
print(f'Zipping {rootPath} to {targetFilename}')
zip_file = ZipFile(targetFilename, 'w')
os.chdir(rootPath)
fname = []
for root,d_names,f_names in os.walk('.'):
	for f in f_names:
		fname.append(os.path.join(root, f))
for f in fname:
    if (not '__pycache__' in f) and (not '.vscode' in f) and (not 'sapoly.geojson' in f):
        print("f = %s" %f)
        zip_file.write(f)
zip_file.close()
print('...finished')
