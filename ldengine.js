$(function() {
  var processMessageTimeout = null;
  // Start monitoring changes to browser history, since GMail is an Ajax app
  $(window).bind("popstate", function(event) {
    clearTimeout(processMessageTimeout);
    // After the history changes, we need to wait for new content to load before we manipulate
    // the DOM, because the elements we want to manipulate may not immediately be available.
    // But, it looks like GMail turns off jQuery's global Ajax events (http://api.jquery.com/category/ajax/global-ajax-event-handlers/)
    // so for now we'll just act on a delay.
    processMessageTimeout = setTimeout(processMessage,1000,event);
  });
  
  function processMessage(event) {
    var relatedEmails;
    // No sidebar?  Then we're not in a message.
    if ($('.y3').length == 0) {
      return;
    }
    // Load all of the html templates
    $.when(
      $.get(chrome.extension.getURL("sidebar.tmpl"), function(data){$.templates('sidebarTemplate',data);}, 'html'),
      $.get(chrome.extension.getURL("popup.tmpl"), function(data){$.templates('popupTemplate',data);}, 'html')
    )
    // Continue when loading is completed
    .then(function() {
      $('.ldengine').detach();
      // Create the container
      var block = $('<div class="ldengine"></div>');
      // Place it on the page
      placeBlock(block);
      // Get the text of the current email
      var text = $('.adP').text();
      // Get related emails from the server
      $.get(chrome.extension.getURL("getSnippets.json"),function(data){
        relatedEmails = data;
        // Link the data from the server to the JsView template
        $.link.sidebarTemplate( ".ldengine", data );
        // Ellipsize the related email snippets
        $('.lde-email-result').dotdotdot();
        // Hook up ze clicks
        for (var i = 0; i < relatedEmails.length; i++) {
          $($('.lde-email-result')[i]).data('data',relatedEmails[i]).click(onClickRelatedEmail);
        }
      },'json');
    });
  }
});

function onClickRelatedEmail() {
  removePopup();
  // Get the data about the related email
  var data = $(this).data('data');
  // Mask the message area
  maskMessageArea();
  // Popup the popup
  $('.ldengine').append($('<div id="lde-popup"></div>'));
  $.link.popupTemplate($('#lde-popup'),data);
  $('#lde-popup').css('top',$(this).position().top+'px');
  $('#lde-popup').click(removePopup);
}

function removePopup() {
  $('#lde-popup').detach();
  maskMessageArea(false);
}

function placeBlock(block) {
  // If there's an ad bar, replace it with our stuff
  if ($('.u5').length > 0) {
    $('.u5').replaceWith(block);
  }
  // Otherwise, if the sidebar has contact info at the top, insert our content after it
  else if ($('.anT').length > 0) {
    block.insertAfter($('.anT'));
  }
  // Otherwise our content at the top of the sidebar
  else {
    $('.adC').prepend(block);
  }
}

function maskMessageArea(mask) {
  $('#lde-msg-mask').detach();
  // If we just want to remove the mask, we're done
  if (mask == false) {
    return;
  }
  // Otherwise, create a mask and place it over the message area
  else {
    //var maskEl = $('<svg id="lde-msg-mask" xmlns="http://www.w3.org/2000/svg" version="1.1" style="z-index:1000; position:absolute; top: 0px; left: 0px; width:100%; height: 100%"><rect x="0" y="0" width="100%" height="100%" style="fill:black;fill-opacity:0.25;" / ></svg>');
    var maskEl = $('<div id="lde-msg-mask"></div>').click(removePopup);
    $('.Bu').first().css('position','relative').append(maskEl);
  }
}