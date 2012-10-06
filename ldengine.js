$(function() {
  // Start monitoring changes to browser history, since GMail is an Ajax app
  $(window).bind("popstate", function(event) {
    // After the history changes, we need to wait for new content to load before we manipulate
    // the DOM, because the elements we want to manipulate may not immediately be available.
    // But, it looks like GMail turns off jQuery's global Ajax events (http://api.jquery.com/category/ajax/global-ajax-event-handlers/)
    // so for now we'll just act on a delay.
    setTimeout(processMessage,1000,event);
  });
  
  function processMessage(event) {
    // No sidebar?  Then we're not in a message.
    if ($('.y3').length == 0) {
      return;
    }
    // Load all of the html templates
    $.when(
      $.get(chrome.extension.getURL("sidebar.tmpl"), function(data){$.templates('sidebarTemplate',data);}, 'html')
    )
    // Continue when loading is completed
    .then(function() {
      $('.ldengine').detach();
      // Create the container
      var block = $('<div class="ldengine"></div>');
      // Place it on the page
      placeBlock(block);
      // Link data to the template and put it in the block
      var data = {
        title: $('.hP').clone(),
        sender: $('.gD').last().attr('name'),
        email: $('.gD').last().attr('email'),
        date: $('.g3').last().attr('title').split(', ')[1],
        text: $('.adP').text()
      };
      $.link.sidebarTemplate( ".ldengine", data );
      $('.lde-email-result').dotdotdot();
    });
  }
});

function placeBlock(block) {
  // If there's an ad bar, replace it with our stuff
  if ($('.u5').length > 0) {
    $('.u5').replaceWith(block);
  }
  // If the bar has contact info at the top, insert our content after it
  else if ($('.anT').length > 0) {
    block.insertAfter($('.anT'));
  }
  // Otherwise insert it at the top
  else {
    $('.adC').prepend(block);
  }
}