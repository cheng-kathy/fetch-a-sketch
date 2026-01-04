# cad-mastersketch


## Usage 

1. Create and save your Onshape API Key from https://cad.onshape.com/user/developer/apiKeys as a JSON file named `APIKey.json` in the root directory with the form below. This file name is added to `.gitignore`, and so it won't be uploaded to GitHub. 
    ```json
    {
        "access": "xxxx", 
        "secret": "xxxx"
    }
    ```
1. 

## Assumptions 

1. A list of multiple master sketches are allowed, but they must be created in the same part studio. 
1. All specified master sketches must be native sketch features in Onshape (e.g., it cannot be an imported feature). 
1. The document, branch, and element that the master sketch locates in are known and specified. 
1. The names of all master sketch features are given, and there exists only one sketch for each given name. If multiple sketches are renamed with the same name, only the earliest appearing one in the feature list is used as the master. 
1. All relevant documents are stored within one single folder in Onshape. Any other documents that do not locate in the same folder with the given document will not be examined. For simplicity, folders within the folder where the main document is located in will not be queried. However, all elements grouped in folders within a document and all features grouped in folders within a part studio will be queried. 
1. Dependencies are only queried from non-sketch features in part studios, and all assemblies are not examined. 
1. Only the main branch is considered for all documents. Dependencies in non-main branches are not queried to avoid duplication.

## Setup:
Parcel setup (for frontend)
- install node.js first: https://nodejs.org/en/download
  
(from this video: https://www.youtube.com/watch?v=xJAfLdUgdc4&t=800s)
- to install parcel: npm install parcel -g
- to install three: npm install three

Backend setup:
- install flask (and other packages if needed)
## Frontend
- Enter frontend/ folder
- Run "parcel serve index.html --no-hmr" in terminal (and it will give a link, which you can copy to the browser)
- If your code changes aren’t showing in the browser, stop the server and run: "Remove-Item -Recurse -Force .parcel-cache, dist" (or modify this command if .parcel-cache or dist is in other folder)
- Then restart the project

## Backend
- Enter backend/ folder
- run "python backend_dependency.py"

## To disable backend api (if you want to directly read from json)

- Open frontend/deal_data.js, find line: "const queryUseLocal = false;" and change it to true.
