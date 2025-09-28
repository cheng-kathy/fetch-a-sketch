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

1. The specified master sketch must be a native sketch feature in Onshape (e.g., it cannot be an imported feature). 
1. The document, branch, and element that the master sketch locates in are known and specified. 
1. The name of the master sketch feature is given, and there exists only one sketch with the given name. If multiple sketches are renamed with the same name, only the earliest appearing one in the feature list is used as the master. 
1. All relevant documents are stored within one single folder in Onshape. Any files that do not locate in the same folder with the given document will not be examined. 
1. Dependencies are only queried from non-sketch features in part studios. 
1. Only the main branch is considered. Dependencies in non-main branches are not queried. 