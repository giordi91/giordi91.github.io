function initPage() {
  // adding the listener to the source input
  document.getElementById("source").addEventListener(
      "keypress", (event) => {
        if (event.key === "Enter" && event.ctrlKey ) {
          processCode();
        }
      });

  //adding listeners to the collapsible to fold
  var coll = document.getElementsByClassName("collapsible");
  for (var i = 0; i < coll.length; i++) {
    coll[i].addEventListener(
        "click", function() {
          this.classList.toggle("active");
          var content = this.nextElementSibling;
          if (content.style.display === "block") {
            content.style.display = "none";
            this.innerHTML="&#x25B6; AST";
          } else {
            content.style.display = "block";
            this.innerHTML="&#x25BC; AST";
          }
        });
  }
}
function openActionTab(evt, actionName) {
      var i, tabcontent, tablinks;
      tabcontent = document.getElementsByClassName("tabcontent");
      for (i = 0; i < tabcontent.length; i++) {
              tabcontent[i].style.display = "none";
            }
      tablinks = document.getElementsByClassName("tablinks");
      for (i = 0; i < tablinks.length; i++) {
              tablinks[i].className = tablinks[i].className.replace(" active", "");
            }
      document.getElementById(actionName).style.display = "block";
      evt.currentTarget.className += " active";
}

function reportBug()
{
  let url = "https://github.com/giordi91/TheBinder/issues/new?labels=bug&title=New+bug+report+(+replace+with+bug+title+please+)&body="

  //lets build the body
  var body = buildBugHeader("", "DESCRIPTION"); 
  body = addEmptySpace(body);
  body = buildBugHeader(body, "SOURCE CODE"); 

  let source = document.getElementById("source").value;
  body = addCodeBug(body,source);
  body = buildBugHeader(body, "OUTPUT"); 
  
  let output = document.getElementById("output").value;
  body = addCodeBug(body,output);

  body = buildBugHeader(body, "EXPECTED OUTPUT"); 
  body = addEmptySpace(body);
  body = buildBugHeader(body, "FURTHER COMMENTS"); 
  body = addEmptySpace(body);

  let completeUrl = url + body;
  var win = window.open(completeUrl, '_blank');
  win.focus();

}

function buildBugHeader(body,value)
{
    return body + `<----------- ${value} ----------->%0A`;
}

function addEmptySpace(body)
{
  return body + "%0A%0A%0A%0A%0A";
}

function addCodeBug(body, code)
{
    toReplace = [
        [";","%3B"],
        ["+","%2B"],
        ["=","%3D"],
        ["/","%2F"],
        ["\n","%0A"]
    ]

    for(var i =0; i < toReplace.length;++i)
    {
        console.log(toReplace[i]);
        code = code.replace(toReplace[i][0],toReplace[i][1]);
        console.log(code);
    }

    return body + "```%0A" + code + "%0A```%0A%0A";


}
