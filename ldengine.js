var API_URL;
var activeMessage = null;
var accountStatus;
$(function() {
  var checkForSidebarTimer = null;
  var checkForAdsTimer = null;
  var checkMessageLoadedTimer = null;
  var checkSidebarRetry;
  
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

  // Load the settings and all of the html templates.  NOTE: the sidebar.tmpl is named so for legacy reasons,
  // but it doesn't represent the whole sidebar; it's just the template for a related email snippet.  The
  // sidebar template is ldengine.tmpl.
  $.when(
    getSettings()
  ).then(function(){
      $.when(
        $.get(chrome.extension.getURL("ldengine.tmpl"), function(data){$.templates('ldengineTemplate',data);}, 'html'),
        $.get(chrome.extension.getURL("sidebar.tmpl"), function(data){$.templates('sidebarTemplate',data);}, 'html'),
        $.get(chrome.extension.getURL("popup.tmpl"), function(data){$.templates('popupTemplate',data);}, 'html'),
        $.get(chrome.extension.getURL("progressbar.tmpl"), function(data){$.templates('progressbarTemplate',data);}, 'html')
      ).then(function(){
          // Start monitoring changes to browser history, since GMail is an Ajax app
          $(window).bind("popstate", function(event) {
            // After the history changes, we need to wait for new content to load before we manipulate
            // the DOM, because the elements we want to manipulate may not immediately be available.
            // But, it looks like GMail turns off jQuery's global Ajax events (http://api.jquery.com/category/ajax/global-ajax-event-handlers/)
            // so for now we'll just act on a delay.
            if (checkForSidebarTimer == null) {
              checkSidebarRetry = 10;
              checkForSidebarTimer = setTimeout(checkForSidebar,1000);
            }
          });
        });
        // Check for the sidebar when we first load the page, in case popstate doesn't fire
        checkSidebarRetry = 10;
        checkForSidebarTimer = setTimeout(checkForSidebar,1000);
    });

  function checkForSidebar() {
    // If there's no sidebar, keep checking
    if ($('.y3').length === 0) {
      console.log("No sidebar...");
      checkSidebarRetry--;
      if (checkSidebarRetry > 0) {
        checkForSidebarTimer = setTimeout(checkForSidebar,1000);
      } else {
        checkForSidebarTimer = null;
      }
      return;
    } else {
      clearTimeout(checkForSidebarTimer);
      checkForSidebarTimer = null;
      processMessage();
    }
  }

  function checkForAds() {
    if ($('#ldengine').length === 0) {
      clearTimeout(checkForAdsTimer);
      checkForAdsTimer = null;
      processMessage();
    }
  }
  
  function processMessage(el) {
    var relatedEmails;

    if (_.isUndefined(el)) {
      el = $('.h7').last();
    } else {
      el = $(el);
    }

    if (el.find('.adP').length === 0) {
      setTimeout(processMessage,100,el[0]);
      return;
    }

    // No sidebar?  Then we're not in a message.
    $.get("http://"+API_URL+"/account/status", function(data){
      accountStatus = data;
      /*
      if (accountStatus.status == 'invalid') {
        showLoginWindow(accountStatus.AuthUrl.url);
        return;
      }
      */

      $('#ldengine').detach();
      // Create the container
      var block = $('<div id="ldengine"></div>');
      // Place it on the page
      placeBlock(block);
      // No data; just a cheap way to render the html template
      $.link.ldengineTemplate('#ldengine');

      // Place the progress bar
      var percentIndexed = accountStatus.percentIndexed || 83;
      $('.lde-progress-bar').html('');
      // No data; just a cheap way to render the html template
      $.link.progressbarTemplate('.lde-progress-bar');
      $('.lde-progress-status').css({width: percentIndexed + '%'});
      $('.lde-progress-value').html(percentIndexed + '%');


      // Get the text of the current email
      var text = el.find('.adP').text();
      // Get the addresses of people this email was sent to
      var toAddresses = [];
      el.find('.hb').find('[email]').each(function(){toAddresses.push($(this).attr('email'));});

      console.log(el.find('.gD').attr('email'));
      var postData = {
        Message: {
          subject: $('.hP').text(),
          body: el.find('.adP').last().text().replace(/\n/g,' '),
          from: el.find('.gD').attr('email'),
          to: toAddresses,
          cc: [],
          bcc: []
        }
      };
        // Post the message to the server and get related snippets
      $.ajax(
        "http://"+API_URL+"/message/relatedSnippets",
        {
          type:'POST',
          data:postData,
          success: function(data){
            relatedEmails = data;
            // Format some stuff up in the data
            for (var i = 0; i < relatedEmails.length; i++) {
              var relatedEmail = relatedEmails[i];
              relatedEmail.date = Date.parse(relatedEmail.date.replace(/\.\d+Z$/,'')).toString('MMM d');
              relatedEmails[i] = relatedEmail;
            }
            // Add the related emails to the sidebar
            $.link.sidebarTemplate( ".lde-related-emails", relatedEmails );
            // Ellipsize the related email snippets
            $('.lde-email-result').dotdotdot();
            // Hook up ze clicks
            for (var i = 0; i < relatedEmails.length; i++) {
              $($('.lde-email-result')[i]).data('data',relatedEmails[i]).click(onClickRelatedEmail);
            }
            
            $('.kv,.hn,.h7').unbind('click',clickMessageThread);
            $('.kv,.hn,.h7').bind('click',clickMessageThread);

            $('.u5').css('overflow','auto');

            if (checkForAdsTimer === null) {
              checkForAdsTimer = setInterval(checkForAds,500);
            }

          },
        dataType: 'json'
      });
    });
  }

  function clickMessageThread() {
    processMessage(this);
  }



});

function onClickRelatedEmail() {
  removePopup();
  if (activeMessage) {
    activeMessage.removeClass('active-snippet');
  }
  activeMessage = $(this);
  activeMessage.addClass('active-snippet');
  popup(activeMessage);
}

function popup(el) {
  if (el === false) {
    return;
  }
  // Mask the message area
  maskMessageArea();
  // Popup the popup
  $('.adC').parent().append($('<div id="lde-popup"></div>'));
  // Since we have vars in the template of the form "from.xyz", the rendering engine will complain
  // if there isn't a "from" object in the data.  So we'll make a blank one and pass it in.
  $.link.popupTemplate($('#lde-popup'),{from:{}});
  // Bind the scroll event of the sidebar so that the popup can track with the
  // message snippet it's attached to
  $('.u5').bind('scroll',scrollPopup);
  // Call the scroll callback to position the popup
  scrollPopup();
  // Get the related message data to fill the popup
  $.get('http://'+API_URL+'/message',{id:el.data('data').id},onReceivedRelatedMessageDetails);
  // Hook up the close button
  $('.lde-popup-close-button').click(removePopup);
}

function onReceivedRelatedMessageDetails(data) {
  // First, highlight the keywords.
  // We'll extract them all first, so that
  // the indexes don't get messed up when
  // we replace the keyword with its highlighted
  // equivalent.  In order to do that, we'll need
  // to get them in order.
  var keywordIndexes = [];
  var keywords = {};
  for (var i = 0; i < data.keywords.length; i++) {
    keyword = data.keywords[i];
    keywordIndexes.push(keyword.offset);
    keywords[keyword.offset] = keyword;
  }
  keywordIndexes.sort();
  var bodyParts = [];
  var currentIndex = 0;
  for (var i = 0; i < keywordIndexes.length; i++) {
    var keywordIndex = keywordIndexes[i];
    var keyword = keywords[keywordIndex];
    bodyParts.push(data.body.substr(currentIndex,(keywordIndex - currentIndex)));
    bodyParts.push('<span class="lde-keyword">'+data.body.substr(keywordIndex,keyword.keyword.length) + '</span>');
    currentIndex = keywordIndex + keyword.keyword.length;
  }
  if (currentIndex < data.body.length) {
    bodyParts.push(data.body.substr(currentIndex));
  }
  var body = bodyParts.join('').replace(/\n/g,"<br/>");
  data.body = body;
  data.date = Date.parse(data.date.replace(/\.\d+Z$/,'')).toString('MMM d');
  // Load the data into the popup
  $.link.popupTemplate($('#lde-popup'),data);
  $('.lde-ajax-spinner').hide();
  $('.lde-popup-content').show();
  // Call the scroll callback to position the popup
  scrollPopup();
  // Hook up the close button
  $('.lde-popup-close-button').click(removePopup);
}

function removePopup() {
  if (activeMessage) {
    activeMessage.removeClass('active-snippet');
  }
  $('.u5').unbind('scroll',scrollPopup);
  $('#lde-popup').detach();
  maskMessageArea(false);
}

function scrollPopup() {
  // Reset the arrow state
  $('.lde-popup-arrow').show();
  $('.lde-popup-arrow').css('top','40px');

  // Get the current position of the active message snippet
  var activeMessageTop = activeMessage.offset().top - $('.u5').offset().top;
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
    popupTop = activeMessageTop;
  }
  // Account for the fact that the message snippet bar may not be at the top of the
  // sidebar (because there might be contact details or something else on top of it)
  popupTop += $('.u5').position().top;
  $('#lde-popup').css('top',popupTop+'px');
}

function placeBlock(block) {
  $('.adC').css('right','20px').css('marginRight','0px').css('width','236px');
  $('.u5').css('width','232px');
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
