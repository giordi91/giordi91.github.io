function showIR(output) {
  var element = document.getElementById('irasm');
  console.log("setting output  ->" , output);
  element.value= output
  element.scrollTop = element.scrollHeight; // focus on bottom
}
