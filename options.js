$(function() {
	var API_URL;
	chrome.storage.local.get('ldengine_api_url',function(items){
		API_URL = items.ldengine_api_url || "apps.ldengine.com";
		$('#api_url').val(API_URL);
		$('#save').click(function(){
			chrome.storage.local.set({ldengine_api_url:$('#api_url').val()});
		});
	});      
});
