var API_URL;
var activeMessage = null;
var accountStatus;



var templatesReady = false;

// Shared alarm object for message scrape-readiness
var messageScrapeAlarm;


/**
 * @test - condition to check
 * @action - do something
 * @tryInterval - how often to try (default to 50ms)
 * @sharedTimer - if sharedTimer is specified, clear it when action is fired
 * @eachTime - function to run each time the condition is checked
 * returns timer
 */

function waitUntil(test, action, tryInterval, sharedTimer, eachTime) {
	var timer = setInterval(function() {
		typeof eachTime === "function" && eachTime();
		if(test()) {
			clearInterval(timer);
			sharedTimer && clearInterval(sharedTimer);
			action();
		}
	}, tryInterval || 50);

	return timer;
}

// A version of waitUntil that won't fire more than once every five seconds
var throttledWaitUntil = _.throttle(waitUntil, 5000);




var Gmail = {

	selectors: {
		sidebar: '.y3',
		adbar: '.u5',
		message: {
			body: '.adP',
			container: '.h7'
		}
	},

	message: {

		// Scrape the message data from the DOM
		scrape: function($el, callback) {
			console.log("Starting scrape process...");
			var thisMessageIsReadyToScrape = _.bind(Gmail.message.isReadyToScrape, this, $el);

			// When this message is loaded, scrape it
			// Use a global timer to prevent multiple clicks from firing multiple POSTs
			clearInterval(messageScrapeAlarm);
			messageScrapeAlarm = waitUntil(thisMessageIsReadyToScrape, function() {

				// Get the addresses of people this email was sent to
				var recipientEmails = _.map($el.find('.hb').find('[email]'), function(recipientEl) {
					return $(recipientEl).attr('email');
				});

				// Return api-ready object
				callback(null, {
					Message: {
						subject: $('.hP').text(),
						body: $el.find(Gmail.selectors.message.body).text().replace(/\n/g, ' '),
						// body: $el.find(Gmail.selectors.message.body).last().text().replace(/\n/g, ' '),
						from: $el.find('.gD').attr('email'),
						to: recipientEmails
						// TODO: cc, bcc
					}
				});

			});
		},

		// Returns whether the *expanded* message is finished loading (and is therefore scrape-able)
		isReadyToScrape: function($el) {
			console.log("Is ready to scrape?!?!?!", $el);
			// console.log("Checking if ",$el," is loaded...", "Looking at ", $el.find(Gmail.selectors.message.body));
			return $el.find(Gmail.selectors.message.body).length;
		},

		// Triggered when a message container is clicked
		click: function($el) {
			var isThisMessageReadyToScrape = _.bind(Gmail.message.isReadyToScrape, this, $el);

			// TODO: call scrape()
		},

		// Bind a click event to each message
		bindClick: function() {
			// $('.kv,.hn,.h7').bind('click', clickMessageThread);
		},

		// POST the message object to the server
		post: function(messageApiObj, callback) {
			console.log("* POST the messageApiObj", messageApiObj);


			// Post the message to the server and get related snippets
			$.ajax(API_URL + "/message/relatedSnippets", {
				type: 'POST',
				data: messageApiObj,
				success: callback,
				dataType: 'json'
			});
		}
	}
};

// Bind objects so we can use *this*
_.bindAll(Gmail);
_.bindAll(Gmail.message);




var LDEngine = {

	sidebar: {

		// Returns whether the sidebar can be appended safely
		isReadyToBeAppended: function() {
			// console.log("Is ready to be appended?!?!?!");
			// console.log("templatesReady",templatesReady);
			// console.log("Gmail.selectors.sidebar",Gmail.selectors.sidebar);
			return templatesReady && $(Gmail.selectors.sidebar).length;
		},

		init: function() {

			
			// Send request to server to see whether the user is logged in or not.
			console.log("Checking logged in status at " + API_URL);
			$.get(API_URL + "/account/status", function(data) {
				LDEngine.sidebar.accountStatus = data;
				
				console.log("Server say ", LDEngine.sidebar.accountStatus);
				console.log(LDEngine.sidebar.accountStatus);

				// Render the appropriate UI depending if you have the data
				if (LDEngine.sidebar.accountStatus.status !== 'linked') {
					LDEngine.sidebar.append();
					$.link.unauthTemplate($('.lde-unauthenticated'), LDEngine.sidebar.accountStatus.AuthUrl);
				} else {
					LDEngine.sidebar.appendLoadingSpinner();
					LDEngine.sidebar.renderUI();
				}

			});
		},

		renderUI: function() {

			// Draw empty sidebar
			this.append();

			// If your'e not logged in:
			// TODO: If you're logged in, do all this:
			// Draw loading spinner

			// Get the last message element
			$el = $(Gmail.selectors.message.container).last();
			console.log("Message to scrape:", $el, "body:", $el.find(Gmail.selectors.message.body));

			// Scrape the message from the Gmail UI
			Gmail.message.scrape($el, function(err, messageApiObj) {

				console.log("Scraped message: ", messageApiObj);

				// Send the scrapped message to the server
				Gmail.message.post(messageApiObj, function(messageSnippets, textStatus) { // afterwards

					// Marshal data from server
					console.log("Data from server: ", messageSnippets);

					// If no snippets are returned, render the noSnippets view and stop the ajax spinner.
					if (messageSnippets.length === 0) {
							$.link.noSnippetsTemplate('.lde-noSnippets');
							LDEngine.sidebar.stopLoadingSpinner();
							return;
					}

					_.map(messageSnippets, function(messageSnippet) {
						return _.extend(messageSnippet, {
							date: messageSnippet.date && new Date(messageSnippet.date).toString('MMM d'),
							from: _.extend(messageSnippet.from, {
								name: messageSnippet.from.name
							})
						});
					});

					// dont show the ajax spinner anymore
					LDEngine.sidebar.stopLoadingSpinner();

					// render the sender info
					LDEngine.sidebar.senderInfo.render();

					// render the progressbar
					LDEngine.sidebar.progressBar.render();

					// Render the message snippets returned from the server
					LDEngine.sidebar.renderSnippets(messageSnippets);

				});
			});

			

			// Listen for clicks on all messages
			Gmail.message.bindClick();
		},

		// Append sidebar to appropriate place in DOM
		append: function() {
			console.log("Appending sidebar...");

			


			// Kill the container if it exists
			if($('#ldengine').length) {
				console.warn("SIDEBAR ALREADY EXISTS, detaching...");
				$('#ldengine').detach();
			}
			// Create the container
			var block = $('<div id="ldengine"></div>');
			$('.adC').prepend(block);

			// No data, just a cheap way to render the html template
			$.link.ldengineTemplate('#ldengine');

		},

		// Append loading spinner to sidebar, right now the process of checking login
		// is taking the longest in the beginning.
		appendLoadingSpinner: function() {


			$('.adC').append('<div class="lde-ajax-spinner"></div>');
			$('.lde-ajax-spinner').show();
		},

		// stop the loading spinner from being displayed,
		// We have this in its own method so it can be called anywhere we need it and dont
		// need to check conditions in appendLoadingSpinner.
		stopLoadingSpinner: function() {
			$('.lde-ajax-spinner').hide();
		},

		renderSnippets: function(messageSnippets) {

			// Add the related emails to the sidebar
			$.link.sidebarTemplate(".lde-related-emails", messageSnippets);

			// Ellipsize the related email snippets
			$('.lde-email-result').dotdotdot();

			// Bind click events to message snippets
			for(var i = 0; i < messageSnippets.length; i++) {
				var messageSnippet = $($('.lde-email-result')[i]);
				messageSnippet.attr('data-id', messageSnippets[i].id);
				messageSnippet.click(LDEngine.sidebar.clickSnippet);

				
				// Replace \n's with <br>'s
				var snippetContentEl = messageSnippet.find(".lde-text");
				snippetContentEl.html(snippetContentEl.html().replace(/(\n)/g,"<br>"));
			}
		},

		//  Clicking on the snippet calls fetch
		clickSnippet: function(e) {

			var id = $(e.currentTarget).attr('data-id');

			// Fetch contents of popup
			LDEngine.popup.fetch(id);
		},

		progressBar: {

			// Renders the progress bar in to the sidebar and keeps it updated until the
			// entire inbox has been indexed.
			render: function() {

				var percentIndexed = LDEngine.sidebar.accountStatus.percentIndexed;

				// Dont even render if we already have everything indexed
				if (percentIndexed === 100) {
					LDEngine.sidebar.progressBar.hide();
					return;
				}

				// Place the progress bar
				$('.lde-progress-bar').html('');

				// updates UI based on new percentIndex every loop
				$.link.progressbarTemplate('.lde-progress-bar');
				$('.lde-progress-status').css({
					width: percentIndexed + '%'
				});
				$('.lde-progress-value').html(percentIndexed + '%');
			},

			hide: function() {
				$('.lde-progress-bar').fadeOut(2500, 'linear');
			}
		},

		senderInfo: {

			// Render the sender info.
			render: function() {
				$.link.senderInfoTemplate('.lde-senderInfo');
			}
		}

	},



	/**
	 * The popup
	 */
	popup: {

		// Gets the message details from the server
		fetch: function(id) {

			// Display empty popup, clear model, and abort pending xhr request if necessary
			LDEngine.popup.model = null;
			LDEngine.popup.display();
			if(LDEngine.popup.xhr) {
				LDEngine.popup.xhr.abort();
			}

			// Get the message details from the server
			console.log("Start fetching", id);
			LDEngine.popup.xhr = $.get(API_URL + '/message', {
				id: id
			}, function(model) {

				// will extend model to have its date property become a formated date
				_.extend(model, {date: model.date && new Date(model.date).toString('MMM d')});

				LDEngine.popup.model = model;
				LDEngine.popup.display();
			});
		},

		// Display the popup
		display: function() {

			// Draw the veil.
			LDEngine.popup.maskMessageArea(true);

			// Render the popup content

			if(!LDEngine.popup.model) {
				// Attach the popup container if necessary
				if(! $('#lde-popup').length) {
					var popupEl = $('<div id="lde-popup"></div>');
					$('.adC').parent().append(popupEl);
				}

				// Show the loading spinner and hide inner content
				$.link.popupTemplate($('#lde-popup'), {
					from: {}
				});
				$('.lde-popup-content').hide();

			} else {
				// Retemplate
				$.link.popupTemplate($('#lde-popup'), LDEngine.popup.model);

				// Hide the loading spinner and display inner content
				$('.lde-ajax-spinner').hide();
				$('.lde-popup-content').show();
			}

			// Hook up the close button
			$('.lde-popup-close-button').click(LDEngine.popup.close);
		},

		// Close the popup and hide the veil
		close: function() {


			$('#lde-popup').detach();

			// Kill the mask.
			LDEngine.popup.maskMessageArea(false);
			
		},

		maskMessageArea: function(mask) {

			$('#lde-msg-mask').detach();
			// If we just want to remove the mask, we're done
			if(mask === false) {
				return;
			}
			// Otherwise, create a mask and place it over the message area
			else {
				var maskEl = $('<div id="lde-msg-mask"></div>').click(LDEngine.popup.close);
				$('.Bu').first().css('position', 'relative').append(maskEl);
			}
		}
	}
};

// Bind objects so we can use *this*
_.bindAll(LDEngine.sidebar);



// Bootstrap
$(function() {

	var checkForSidebarTimer = null;
	var checkForAdsTimer = null;
	var checkMessageLoadedTimer = null;
	var checkSidebarRetry;

	// When sidebar can we safely appended, immediately append it (spam until it's possible, then do it)
	throttledWaitUntil(LDEngine.sidebar.isReadyToBeAppended, LDEngine.sidebar.init, 25);

	// Start monitoring changes to browser history
	$(window).bind("popstate", function(event) {
		// On popstate, try to initialize the sidebar again
		if(window.location.hash.match(/#inbox\/\S+/)) {
			throttledWaitUntil(LDEngine.sidebar.isReadyToBeAppended, LDEngine.sidebar.init, 25);
		}
	});

	// Create a deferred object to wrap around a call to Chrome's
	// local storage API.  This lets us chain our request for
	// settings with our other startup requests

	function getSettings() {
		var getApiURLDeferredObj = $.Deferred();
		chrome.storage.local.get('ldengine_api_url', function(items) {

			// For now, to avoid any weird issues w/ people who already installed
			// the existing version, hard-code the production host
			// API_URL = "apps.ldengine.com";
			API_URL = items.ldengine_api_url || "https://apps.ldengine.com";
			getApiURLDeferredObj.resolve();
		});
		return getApiURLDeferredObj.promise();
	}

	// Load the settings and all of the html templates.
	$.when(getSettings()).then(function() {
		$.when($.get(chrome.extension.getURL("ldengine.tmpl"), function(data) {
			$.templates('ldengineTemplate', data);
		}, 'html'),
		$.get(chrome.extension.getURL("snippet.tmpl"), function(data) {
			$.templates('sidebarTemplate', data);
		}, 'html'),
		$.get(chrome.extension.getURL("popup.tmpl"), function(data) {
			$.templates('popupTemplate', data);
		}, 'html'),
		$.get(chrome.extension.getURL("unauthenticated.tmpl"), function(data) {
			$.templates('unauthTemplate', data);
		}, 'html'),
		$.get(chrome.extension.getURL("senderInfo.tmpl"), function(data) {
			$.templates('senderInfoTemplate', data);
		}, 'html'),
		$.get(chrome.extension.getURL("progressbar.tmpl"), function(data) {
			$.templates('progressbarTemplate', data);
		}, 'html'),
		$.get(chrome.extension.getURL("noSnippets.tmpl"), function(data) {
			$.templates('noSnippetsTemplate', data);
		}, 'html')).then(function() {
			// Set global state that UI templates are ready
			templatesReady = true;
		});
	});
});
	///////
	//////////
	////////
	///////
	//////////
	////////
	///////	////////
	///////
	//////////
	////////
	///////
	//////////
	////////
	///////
	//////////
	////////
	///////
	//////////
	////////
	///////
	//////////
	////////
	///////
	//////////
	////////
	///////
	//////////
	////////
	///////
	//////////
	////////
	///////	////////
	///////
	//////////
	////////
	///////
	//////////
	////////
	///////
	//////////
	////////
	///////
	//////////
	////////
	///////
	//////////
	////////
	///////
	//////////
	////////
	///////
	//////////
	////////
	///////
	//////////
	////////
	///////	////////
	///////
	//////////
	////////
	///////
	//////////
	////////
	///////
	//////////
	////////
	///////
	//////////
	////////
	///////
	//////////
	////////
	///////
	//////////
	////////
	///////
	//////////
	////////
	///////
	//////////
	////////
	///////
	//////////
	// Process the currently selected message and get related snippets
	// to put in the side bar
	// $('.kv,.hn,.h7').unbind('click', clickMessageThread);
	// 				$('.kv,.hn,.h7').bind('click', clickMessageThread);
	// 				$(adBarClass).css('overflow', 'auto');
	// 				if(checkForAdsTimer === null) {
	// 					checkForAdsTimer = setInterval(checkForAds, 500);
	// 				}

// 	function processMessage(el) {
// 		var relatedEmails;

// 		// If this is an initial message load (rather than the result
// 		// of clicking a thread message) then find the last message on
// 		// the page and pretend we clicked on it.
// 		if(_.isUndefined(el)) {
// 			el = $(Gmail.selectors.message.container).last();
// 		} else {
// 			el = $(el);
// 		}

// 		// If the message has no body (because it hasn't loaded yet)
// 		// then keep retrying until it does
// 		if(el.find(Gmail.selectors.message.body).length === 0) {
// 			setTimeout(processMessage, 100, el[0]);
// 			return;
// 		}

// 		// Get the user's account status to check for the inbox percent loaded
// 		// and to check their login state
// 		$.get(LDEngine.protocol + API_URL + "/account/status", function(data) {
// 			accountStatus = data;
// 			/*
//       if (accountStatus.status == 'invalid') {
//         showLoginWindow(accountStatus.AuthUrl.url);
//         return;
//       }
//       */



// 			// Place the progress bar
// 			var percentIndexed = accountStatus.percentIndexed || 83;
// 			$('.lde-progress-bar').html('');
// 			// No data; just a cheap way to render the html template
// 			$.link.progressbarTemplate('.lde-progress-bar');
// 			$('.lde-progress-status').css({
// 				width: percentIndexed + '%'
// 			});
// 			$('.lde-progress-value').html(percentIndexed + '%');



// 			// // Get the text of the current email
// 			// var text = el.find('.adP').text();
// 			// // Get the addresses of people this email was sent to
// 			// var toAddresses = [];
// 			// el.find('.hb').find('[email]').each(function() {
// 			// 	toAddresses.push($(this).attr('email'));
// 			// });
// 			// console.log(el.find('.gD').attr('email'));
// 			// var postData = {
// 			// 	Message: {
// 			// 		subject: $('.hP').text(),
// 			// 		body: el.find('.adP').last().text().replace(/\n/g, ' '),
// 			// 		from: el.find('.gD').attr('email'),
// 			// 		to: toAddresses,
// 			// 		cc: [],
// 			// 		bcc: []
// 			// 	}
// 			// };
// 		});
// 	}

// 	// Callback for clicking on a message in a thread

// 	function clickMessageThread() {
// 		processMessage(this);
// 	}

// });

// // Callback for clicking an email snippet

// function onClickRelatedEmail() {
// 	removePopup();
// 	if(activeMessage) {
// 		activeMessage.removeClass('active-snippet');
// 	}
// 	activeMessage = $(this);
// 	activeMessage.addClass('active-snippet');
// 	popup(activeMessage);
// }



// //
// //
// //  Appending the dialog box
// //
// //

// function onReceivedRelatedMessageDetails(data) {
// 	// First, highlight the keywords.
// 	// We'll extract them all first, so that
// 	// the indexes don't get messed up when
// 	// we replace the keyword with its highlighted
// 	// equivalent.  In order to do that, we'll need
// 	// to get them in order.
// 	var keywordIndexes = [];
// 	var keywords = {};
// 	for(var i = 0; i < data.keywords.length; i++) {
// 		keyword = data.keywords[i];
// 		keywordIndexes.push(keyword.offset);
// 		keywords[keyword.offset] = keyword;
// 	}
// 	// Sort the keywords by where they appear in the body
// 	keywordIndexes.sort();
// 	var bodyParts = [];
// 	var currentIndex = 0;
// 	// Split the body into an array with the stylized
// 	// keywords in their own elements. So for 
// 	// "I love to eat spaghetti all the time", if the
// 	// keyword is "spaghetti", you end up with
// 	// ['I love to eat ', '<span class="lde-keyord">spaghetti</span>',' all the time']
// 	for(var i = 0; i < keywordIndexes.length; i++) {
// 		var keywordIndex = keywordIndexes[i];
// 		var keyword = keywords[keywordIndex];
// 		bodyParts.push(data.body.substr(currentIndex, (keywordIndex - currentIndex)));
// 		bodyParts.push('<span class="lde-keyword">' + data.body.substr(keywordIndex, keyword.keyword.length) + '</span>');
// 		currentIndex = keywordIndex + keyword.keyword.length;
// 	}
// 	// Make sure you get the rest of the body if it doesn't end on a keyword
// 	if(currentIndex < data.body.length) {
// 		bodyParts.push(data.body.substr(currentIndex));
// 	}
// 	// Join the body parts back up, and replace newlines with <br/> tags
// 	var body = bodyParts.join('').replace(/\n/g, "<br/>");
// 	data.body = body;
// 	// Make the date pretty
// 	data.date = Date.parse(data.date.replace(/\.\d+Z$/, '')).toString('MMM d');
// 	// Load the data into the popup
// 	$.link.popupTemplate($('#lde-popup'), data);
// 	// Hide the loading spinner
// 	$('.lde-ajax-spinner').hide();
// 	// Display the inner content
// 	$('.lde-popup-content').show();
// 	// Call the scroll callback to position the popup
// 	scrollPopup();
// 	// Hook up the close button
// 	$('.lde-popup-close-button').click(removePopup);
// }

////
//////////
////////
///////
//////////
////////
///////
//////////
////////
///////
//////////
////////
///////
//////////
////////
///////
//////////
////////
///////
//////////
////////
///////
//////////
////////
///////	////////
///////
//////////
////////
///////
//////////
////////
///////
//////////
////////
///////
//////////
////////
///////
//////////
////////
///////
//////////
////////
///////
//////////
////////
///////
//////////
////////
///////	////////
///////
//////////
////////
///////
//////////

// function popup(el) {
// 	if(el === false) {
// 		return;
// 	}
// 	// Mask the message area
// 	maskMessageArea();
// 	// Popup the popup
// 	$('.adC').parent().append($('<div id="lde-popup"></div>'));
// 	// Since we have vars in the template of the form "from.xyz", the rendering engine will complain
// 	// if there isn't a "from" object in the data.  So we'll make a blank one and pass it in.
// 	$.link.popupTemplate($('#lde-popup'), {
// 		from: {}
// 	});
// 	// Bind the scroll event of the sidebar so that the popup can track with the
// 	// message snippet it's attached to
// 	$(adBarClass).bind('scroll', scrollPopup);
// 	// Call the scroll callback to position the popup
// 	scrollPopup();
// 	// Get the related message data to fill the popup
// 	$.get(API_URL + '/message', {
// 		id: el.data('data').id
// 	}, onReceivedRelatedMessageDetails);
// 	// Hook up the close button
// 	$('.lde-popup-close-button').click(removePopup);
// }

// function removePopup() {
// 	// If there's an active message, make it inactive
// 	if(activeMessage) {
// 		activeMessage.removeClass('active-snippet');
// 	}
// 	// Unbind the scroll event from the (now inactive) message
// 	$(adBarClass).unbind('scroll', scrollPopup);
// 	// Kill the popup
// 	$('#lde-popup').detach();
// 	// Kill the mask
// 	maskMessageArea(false);
// }

// function scrollPopup() {



// 	// Reset the arrow state
// 	$('.lde-popup-arrow').show();
// 	$('.lde-popup-arrow').css('top', '40px');

// 	// Get the current position of the active message snippet
// 	var activeMessageTop = activeMessage.offset().top - $(adBarClass).offset().top;
// 	var popupTop;

// 	if(activeMessageTop < 0) {
// 		// If the top of the message snippet is out of view, then peg the
// 		// popup to the top of the message view
// 		popupTop = 0;
// 		// If the message snippit is completely out of view, then hide the arrow
// 		if(activeMessageTop < 0 - (activeMessage.height() - 40)) {
// 			$('.lde-popup-arrow').hide();
// 		}
// 	} else if(activeMessageTop + $('#lde-popup').height() > $(adBarClass).height()) {
// 		// If the message snippet is low enough that the popup would start to be
// 		// pushed off-screen, then peg the popup to the bottom of the message view
// 		popupTop = ($(adBarClass).height() - $('#lde-popup').height());
// 		// Move the arrow so that it's consistently pointing at the message snippet
// 		$('.lde-popup-arrow').css('top', 40 - ($(adBarClass).height() - (activeMessageTop + $('#lde-popup').height())) + 'px');
// 		// If the message snippet is out of view, hide the arrow
// 		if(activeMessageTop > ($(adBarClass).height() - 40)) {
// 			$('.lde-popup-arrow').hide();
// 		}
// 	}
// 	// If the message is clearly in view, just move the popup along with it
// 	else {
// 		popupTop = activeMessageTop;
// 	}
// 	// Account for the fact that the message snippet bar may not be at the top of the
// 	// sidebar (because there might be contact details or something else on top of it)
// 	popupTop += $(adBarClass).position().top;
// 	$('#lde-popup').css('top', popupTop + 'px');
// }

// // function placeBlock(block) {
// // 	// Do some adjustments on the ad bar container and the adbar
// // 	$('.adC').css('right', '20px').css('marginRight', '0px').css('width', '236px');
// // 	$(adBarClass).css('width', '232px');
// // 	// If there's an ad bar, replace it with our stuff
// // 	if($(adBarClass).length > 0) {
// // 		$(adBarClass).empty();
// // 		$(adBarClass).append(block);
// // 	}
// // 	// Otherwise, if the sidebar has contact info at the top, insert our content after it
// // 	else if($('.anT').length > 0) {
// // 		block.insertAfter($('.anT'));
// // 	}
// // 	// Otherwise our content at the top of the sidebar
// // 	else {
// // 		$('.adC').prepend(block);
// // 	}
// // }