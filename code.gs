function doGet(e) {
  var page = e && e.parameter.page ? e.parameter.page : "index";
  return HtmlService.createHtmlOutputFromFile(page);
}
