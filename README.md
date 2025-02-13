## Acknowledgements
This package uses modified version of https://github.com/lucacasonato/cases



```mermaid
gitGraph
   branch template/example
   commit id: "Init implementation"
   commit id: "Extracted variables"
   checkout main
   commit
   commit
   branch templit/new-xa4asd
   checkout templit/new-xa4asd
   merge template/example tag: "merge" id: "Merge template template/example"
   checkout main
   merge templit/new-xa4asd id: "Template template/example used" type: HIGHLIGHT tag: "cherry-pick"
   commit id: "Replaced variables in template"
```