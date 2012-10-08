var API_URL = localStorage["ldengine_api_url"];
$(function() {
  console.log(API_URL); 
  var processMessageTimeout = null;
  var activeMessage = null;
  // Start monitoring changes to browser history, since GMail is an Ajax app
  $(window).bind("popstate", function(event) {
    clearTimeout(processMessageTimeout);
    // After the history changes, we need to wait for new content to load before we manipulate
    // the DOM, because the elements we want to manipulate may not immediately be available.
    // But, it looks like GMail turns off jQuery's global Ajax events (http://api.jquery.com/category/ajax/global-ajax-event-handlers/)
    // so for now we'll just act on a delay.
    processMessageTimeout = setTimeout(processMessage,1000,event);
  });

  // Create a deferred object to wrap around a call to Chrome's 
  // local storage API.  This lets us chain our request for
  // settings with our other startup requests
  function getSettings() {
    var getApiURLDeferredObj = $.Deferred();
    chrome.storage.local.get('ldengine_api_url',function(items){
      API_URL = items.ldengine_api_url || "localhost:3001";
      getApiURLDeferredObj.resolve();
    });
    return getApiURLDeferredObj.promise();    
  }
  
  function processMessage(event) {
    var relatedEmails;
    // No sidebar?  Then we're not in a message.
    if ($('.y3').length === 0) {
      return;
    }
    // Load the settings and all of the html templates
    $.when(
      getSettings(),
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
      // Get the addresses of people this email was sent to
      var toAddresses = [];
      $('.hb').last().find('[email]').each(function(){toAddresses.push($(this).attr('email'));});
      // Create the message to post to the server asking for related snippets
      var postData = {
        subject: $('.hP').text(),
        body: $('.adP').last().text().replace(/\n/g,' '),
        from: $('.h7').last().find('.gD').attr('email'),
        to: toAddresses,
        cc: [],
        bcc: []
      };
      // Post the message to the server and get related snippets
      console.log(JSON.stringify(postData));
      $.post("http://"+API_URL+"/message/relatedSnippets",{Message:JSON.stringify(postData)},function(data){
        console.log(data);
        relatedEmails = data;
        // Format some stuff up in the data
        for (var i = 0; i < relatedEmails.length; i++) {
          var relatedEmail = relatedEmails[i];
          relatedEmail.date = Date.parse(relatedEmail.date.replace(/\.\d+Z$/,'')).toString('MMM d');
          relatedEmails[i] = relatedEmail;
        }
        // Link the data from the server to the JsView template
        $.link.sidebarTemplate( ".ldengine", relatedEmails );
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
  activeMessage = $(this);
  popup($(this));
}

function popup(el) {
  removePopup();
  if (el === false) {
    return;
  }
  // Mask the message area
  maskMessageArea();
  // Popup the popup
  $('.adC').parent().append($('<div id="lde-popup"></div>'));
  $.link.popupTemplate($('#lde-popup'),{});
  // Bind the scroll event of the sidebar so that the popup can track with the
  // message snippet it's attached to
  $('.u5').bind('scroll',scrollPopup);
  // Call the scroll callback to position the popup
  scrollPopup();
  // Get the related message data to fill the popup
  $.get('http://'+API_URL+'/message/'+el.data('data').id,onReceivedRelatedMessageDetails);
  // Hook up the close button
  $('.lde-popup-close-button').click(removePopup);
}

function onReceivedRelatedMessageDetails(data) {
  data.body = data.body.replace(/\\n/g,"<br/>");
  $.link.popupTemplate($('#lde-popup'),data);
  $('.lde-ajax-spinner').hide();
  $('.lde-popup-content').show();
  // Call the scroll callback to position the popup
  scrollPopup();
  // Hook up the close button
  $('.lde-popup-close-button').click(removePopup);
}

function removePopup() {
  $('.u5').unbind('scroll',scrollPopup);
  $('#lde-popup').detach();
  maskMessageArea(false);
}

function scrollPopup() {
  // Reset the arrow state
  $('.lde-popup-arrow').show();
  $('.lde-popup-arrow').css('top','40px');

  // Get the current position of the active message snippet
  var activeMessageTop = activeMessage.position().top;
  var popupTop;

  if (activeMessageTop < 0) {
    // If the top of the message snippet is out of view, then peg the
    // popup to the top of the message view
    popupTop = 0;
    // If the message snippit is completely out of view, then hide the arrow
    if (activeMessageTop < 0 - (activeMessage.height() - 40)) {
      $('.lde-popup-arrow').hide();
    }
  }
  else if (activeMessageTop + $('#lde-popup').height() > $('.u5').height()) {
    // If the message snippet is low enough that the popup would start to be
    // pushed off-screen, then peg the popup to the bottom of the message view
    popupTop = ($('.u5').height() - $('#lde-popup').height());
    // Move the arrow so that it's consistently pointing at the message snippet
    $('.lde-popup-arrow').css('top',40-($('.u5').height() - (activeMessageTop + $('#lde-popup').height()))+'px');
    // If the message snippet is out of view, hide the arrow
    if (activeMessageTop > ($('.u5').height()-40)) {
      $('.lde-popup-arrow').hide();
    }
  }
  // If the message is clearly in view, just move the popup along with it
  else {
    popupTop = activeMessage.position().top;
  }
  // Account for the fact that the message snippet bar may not be at the top of the
  // sidebar (because there might be contact details or something else on top of it)
  popupTop += $('.u5').position().top;
  $('#lde-popup').css('top',popupTop+'px');
}

function placeBlock(block) {
  // If there's an ad bar, replace it with our stuff
  if ($('.u5').length > 0) {
    $('.u5').empty();
    $('.u5').append(block);
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
  if (mask === false) {
    return;
  }
  // Otherwise, create a mask and place it over the message area
  else {
    var maskEl = $('<div id="lde-msg-mask"></div>').click(removePopup);
    $('.Bu').first().css('position','relative').append(maskEl);
  }
}