/* global sdawebGcalMiniL10n */
/**
 * SDAweb Calendar Sync — mini-month behavior.
 *
 * Two panel modes share one container:
 *
 *   - Default panel: Today + upcoming events (chronological), with a
 *     "Load more events" button that reveals 3 more per click. Server
 *     pre-renders the initial slice; JS owns the load-more state.
 *
 *   - Day panel: events for a tapped day. Replaces the default panel
 *     until the user clicks Back/Close, at which point the default
 *     panel restores (preserving how many "load more" reveals had
 *     already happened).
 *
 * The optional "View full calendar" link in the footer always shows in
 * default mode and hides in day mode (different context).
 */
( function () {
	'use strict';

	var L10N = ( typeof window.sdawebGcalMiniL10n === 'object' && window.sdawebGcalMiniL10n ) || {
		no_events: 'No events.',
		open: 'Open event',
	};

	function init() {
		// v0.13.2: query by `.sdaweb-gcal--mini` class rather than the
		// `[data-sdaweb-gcal-mini]` attribute. The attribute is part of the
		// wrapper opening tag that swap.js's REST response discards via
		// `extract_inner_html()`, so after a swap-to-mini the existing root
		// never gains the attribute — only its className is updated. The
		// class-based query works for both initial render (attribute + class
		// both present) and post-swap (class only).
		var roots = document.querySelectorAll( '.sdaweb-gcal--mini' );
		Array.prototype.forEach.call( roots, setup );
	}

	function setup( root ) {
		if ( root.__sdawebGcalMiniBound ) {
			return;
		}
		root.__sdawebGcalMiniBound = true;

		var dataNode = root.querySelector( '[data-sdaweb-gcal-mini-data]' );
		var panel = root.querySelector( '[data-sdaweb-gcal-mini-popover]' );
		var titleEl = root.querySelector( '[data-sdaweb-gcal-mini-popover-title]' );
		var bodyEl = root.querySelector( '[data-sdaweb-gcal-mini-popover-body]' );
		var grid = root.querySelector( '.sdaweb-gcal-mini__grid' );
		var closeBtn = root.querySelector( '[data-sdaweb-gcal-mini-popover-close]' );
		var backBtn = root.querySelector( '[data-sdaweb-gcal-mini-back]' );
		var loadMoreBtn = root.querySelector( '[data-sdaweb-gcal-mini-load-more]' );
		var fullLink = root.querySelector( '[data-sdaweb-gcal-mini-full-link]' );

		if ( ! dataNode || ! panel || ! grid ) {
			return;
		}

		var raw = {};
		try {
			raw = JSON.parse( dataNode.textContent || '{}' );
		} catch ( e ) {
			raw = {};
		}
		var dayEvents = raw.days || {};
		var upcoming = Array.isArray( raw.upcoming ) ? raw.upcoming : [];

		var defaultMode = panel.getAttribute( 'data-sdaweb-gcal-mini-default' ) || 'today_upcoming';
		var defaultHeading = panel.getAttribute( 'data-sdaweb-gcal-mini-default-heading' ) || '';
		var emptyText = panel.getAttribute( 'data-sdaweb-gcal-mini-default-empty' ) || L10N.no_events;
		var initialVisible = parseInt( panel.getAttribute( 'data-sdaweb-gcal-mini-initial-visible' ) || '4', 10 );
		var visibleCount = initialVisible;
		var step = 3;

		var view = ( defaultMode === 'today_upcoming' ) ? 'default' : 'idle';

		// Cells.
		var cells = grid.querySelectorAll( '[data-sdaweb-gcal-mini-day]' );
		Array.prototype.forEach.call( cells, function ( cell ) {
			cell.addEventListener( 'click', function ( event ) {
				event.preventDefault();
				if ( cell.getAttribute( 'aria-disabled' ) === 'true' ) {
					return;
				}
				if ( cell.classList.contains( 'is-selected' ) ) {
					switchToDefault();
					return;
				}
				switchToDay( cell.getAttribute( 'data-sdaweb-gcal-mini-day' ), cell );
			} );
		} );

		grid.addEventListener( 'keydown', function ( event ) {
			if ( event.key !== 'ArrowLeft' && event.key !== 'ArrowRight' && event.key !== 'ArrowUp' && event.key !== 'ArrowDown' ) {
				return;
			}
			var active = document.activeElement;
			if ( ! active || ! active.classList || ! active.classList.contains( 'sdaweb-gcal-mini__cell' ) ) {
				return;
			}
			var list = Array.prototype.slice.call( cells );
			var idx = list.indexOf( active );
			if ( idx === -1 ) {
				return;
			}
			var s = 0;
			switch ( event.key ) {
				case 'ArrowLeft': s = -1; break;
				case 'ArrowRight': s = 1; break;
				case 'ArrowUp': s = -7; break;
				case 'ArrowDown': s = 7; break;
			}
			var next = list[ idx + s ];
			if ( next ) {
				event.preventDefault();
				next.focus();
			}
		} );

		if ( closeBtn ) {
			closeBtn.addEventListener( 'click', function ( event ) {
				event.preventDefault();
				switchToDefault();
			} );
		}

		if ( backBtn ) {
			backBtn.addEventListener( 'click', function ( event ) {
				event.preventDefault();
				switchToDefault();
			} );
		}

		if ( loadMoreBtn ) {
			loadMoreBtn.addEventListener( 'click', function ( event ) {
				event.preventDefault();
				revealMore();
			} );
		}

		// Tap on a row in the "Today and upcoming" panel switches the panel to
		// that event's full day, mirroring what tapping the day's cell in the
		// grid would do. Replaces the previous "one-event hover popover" path
		// (which never worked reliably on touch in landscape anyway).
		panel.addEventListener( 'click', function ( event ) {
			var dayLink = event.target && event.target.closest
				? event.target.closest( '[data-sdaweb-gcal-mini-day-link]' )
				: null;
			if ( ! dayLink || ! panel.contains( dayLink ) ) {
				return;
			}
			event.preventDefault();
			var dayKey = dayLink.getAttribute( 'data-sdaweb-gcal-mini-day-link' );
			if ( ! dayKey ) {
				return;
			}
			var cell = grid.querySelector( '[data-sdaweb-gcal-mini-day="' + dayKey + '"]' );
			switchToDay( dayKey, cell );
		} );

		panel.addEventListener( 'keydown', function ( event ) {
			if ( event.key !== 'Enter' && event.key !== ' ' ) {
				return;
			}
			var dayLink = event.target && event.target.closest
				? event.target.closest( '[data-sdaweb-gcal-mini-day-link]' )
				: null;
			if ( ! dayLink || ! panel.contains( dayLink ) ) {
				return;
			}
			event.preventDefault();
			var dayKey = dayLink.getAttribute( 'data-sdaweb-gcal-mini-day-link' );
			if ( ! dayKey ) {
				return;
			}
			var cell = grid.querySelector( '[data-sdaweb-gcal-mini-day="' + dayKey + '"]' );
			switchToDay( dayKey, cell );
		} );

		document.addEventListener( 'keydown', function ( event ) {
			if ( event.key === 'Escape' && view === 'day' ) {
				switchToDefault();
			}
		} );

		// First render.
		applyView();

		function applyView() {
			if ( view === 'idle' ) {
				panel.hidden = true;
				panel.classList.remove( 'is-default', 'is-day' );
				root.classList.remove( 'is-popover-open' );
				return;
			}

			panel.hidden = false;
			// Force layout flush so the entry transition runs.
			// eslint-disable-next-line no-unused-expressions
			panel.offsetHeight;

			if ( view === 'default' ) {
				panel.classList.add( 'is-default' );
				panel.classList.remove( 'is-day' );
				if ( titleEl ) {
					titleEl.textContent = defaultHeading;
				}
				if ( closeBtn ) {
					closeBtn.hidden = true;
				}
				if ( backBtn ) {
					backBtn.hidden = true;
				}
				renderUpcomingBody();
				if ( loadMoreBtn ) {
					loadMoreBtn.hidden = ! ( upcoming.length > visibleCount );
				}
				if ( fullLink ) {
					fullLink.hidden = false;
				}
				root.classList.add( 'is-popover-open' );
			} else if ( view === 'day' ) {
				panel.classList.add( 'is-day' );
				panel.classList.remove( 'is-default' );
				if ( closeBtn ) {
					closeBtn.hidden = false;
				}
				if ( backBtn ) {
					backBtn.hidden = ( defaultMode !== 'today_upcoming' );
				}
				if ( loadMoreBtn ) {
					loadMoreBtn.hidden = true;
				}
				if ( fullLink ) {
					fullLink.hidden = true;
				}
				root.classList.add( 'is-popover-open' );
			}
		}

		function switchToDay( dayKey, cell ) {
			var prevSelected = grid.querySelector( '.sdaweb-gcal-mini__cell.is-selected' );
			if ( prevSelected ) {
				prevSelected.classList.remove( 'is-selected' );
			}
			if ( cell ) {
				cell.classList.add( 'is-selected' );
			}
			view = 'day';
			if ( titleEl ) {
				titleEl.textContent = formatDayHeading( dayKey, cell );
			}
			renderDayBody( dayEvents[ dayKey ] || [] );
			applyView();
		}

		function switchToDefault() {
			var prevSelected = grid.querySelector( '.sdaweb-gcal-mini__cell.is-selected' );
			if ( prevSelected ) {
				prevSelected.classList.remove( 'is-selected' );
			}
			if ( defaultMode === 'today_upcoming' ) {
				view = 'default';
			} else {
				view = 'idle';
			}
			applyView();
		}

		function revealMore() {
			visibleCount = Math.min( upcoming.length, visibleCount + step );
			renderUpcomingBody();
			if ( loadMoreBtn ) {
				loadMoreBtn.hidden = ! ( upcoming.length > visibleCount );
			}
		}

		function renderUpcomingBody() {
			if ( ! bodyEl ) {
				return;
			}
			clearChildren( bodyEl );
			if ( ! upcoming.length ) {
				var p = document.createElement( 'p' );
				p.className = 'sdaweb-gcal-mini__panel-empty';
				p.textContent = emptyText;
				bodyEl.appendChild( p );
				return;
			}
			var slice = upcoming.slice( 0, visibleCount );
			slice.forEach( function ( ev ) {
				bodyEl.appendChild( buildUpcomingNode( ev ) );
			} );
		}

		function renderDayBody( events ) {
			if ( ! bodyEl ) {
				return;
			}
			clearChildren( bodyEl );
			if ( ! events.length ) {
				var p = document.createElement( 'p' );
				p.className = 'sdaweb-gcal-mini__panel-empty';
				p.textContent = L10N.no_events;
				bodyEl.appendChild( p );
				return;
			}
			events.forEach( function ( ev ) {
				bodyEl.appendChild( buildDayNode( ev ) );
			} );
		}

		function buildInfoIcon() {
			// Mirrors Views\Event_Link::icon() so the shared
			// .sdaweb-gcal-event-info-icon CSS styles it identically. Constant
			// markup with no user data — safe to assign via innerHTML.
			var span = document.createElement( 'span' );
			span.className = 'sdaweb-gcal-event-info-icon';
			span.setAttribute( 'aria-hidden', 'true' );
			span.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" focusable="false"><circle cx="12" cy="12" r="9"></circle><line x1="12" y1="11" x2="12" y2="16"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>';
			return span;
		}

		function buildUpcomingNode( ev ) {
			var item = document.createElement( 'div' );
			item.className = 'sdaweb-gcal-mini__panel-event';
			if ( ev.color ) {
				item.style.setProperty( '--sdaweb-gcal-event-color', ev.color );
			}
			// Whole-row click switches the panel to that event's day. Title is
			// plain text, not a link — visitors who want Google Calendar tap
			// the title in the day view that opens. data-sdaweb-gcal-event-id
			// is intentionally omitted so the desktop hover popover ignores
			// these rows (we use day-switch as the touch UX instead).
			if ( ev.date_iso ) {
				item.setAttribute( 'data-sdaweb-gcal-mini-day-link', ev.date_iso );
				item.setAttribute( 'role', 'button' );
				item.setAttribute( 'tabindex', '0' );
			}

			if ( ev.date_label ) {
				var date = document.createElement( 'span' );
				date.className = 'sdaweb-gcal-mini__panel-event-date';
				date.textContent = ev.date_label;
				item.appendChild( date );
			}

			var body = document.createElement( 'div' );
			body.className = 'sdaweb-gcal-mini__panel-event-body';

			var titleRow = document.createElement( 'div' );
			titleRow.className = 'sdaweb-gcal-mini__panel-event-title';
			if ( ev.hasinfo ) {
				titleRow.appendChild( buildInfoIcon() );
				titleRow.appendChild( document.createTextNode( ev.title || '' ) );
			} else {
				titleRow.textContent = ev.title || '';
			}
			body.appendChild( titleRow );

			if ( ev.time ) {
				var time = document.createElement( 'div' );
				time.className = 'sdaweb-gcal-mini__panel-event-time';
				time.textContent = ev.time;
				body.appendChild( time );
			}

			if ( ev.location ) {
				var loc = document.createElement( 'div' );
				loc.className = 'sdaweb-gcal-mini__panel-event-location';
				loc.textContent = ev.location;
				body.appendChild( loc );
			}

			item.appendChild( body );
			return item;
		}

		function buildDayNode( ev ) {
			var item = document.createElement( 'div' );
			item.className = 'sdaweb-gcal-mini__popover-event';
			if ( ev.color ) {
				item.style.setProperty( '--sdaweb-gcal-event-color', ev.color );
			}
			if ( ev.id ) {
				item.setAttribute( 'data-sdaweb-gcal-event-id', ev.id );
				item.setAttribute( 'data-sdaweb-gcal-display-id', root.getAttribute( 'data-sdaweb-gcal-id' ) || '' );
			}

			if ( ev.time ) {
				var time = document.createElement( 'span' );
				time.className = 'sdaweb-gcal-mini__popover-event-time';
				time.textContent = ev.time;
				item.appendChild( time );
			}

			var body = document.createElement( 'div' );
			body.className = 'sdaweb-gcal-mini__popover-event-body';

			var title = document.createElement( 'div' );
			title.className = 'sdaweb-gcal-mini__popover-event-title';
			if ( ev.url ) {
				var a = document.createElement( 'a' );
				a.href = ev.url;
				if ( ev.newtab ) {
					a.target = '_blank';
					a.rel = 'noopener noreferrer';
				}
				a.title = L10N.open;
				if ( ev.hasinfo ) {
					a.appendChild( buildInfoIcon() );
				}
				a.appendChild( document.createTextNode( ev.title || '' ) );
				title.appendChild( a );
			} else if ( ev.hasinfo ) {
				title.appendChild( buildInfoIcon() );
				title.appendChild( document.createTextNode( ev.title || '' ) );
			} else {
				title.textContent = ev.title || '';
			}
			body.appendChild( title );

			if ( ev.location ) {
				var loc = document.createElement( 'div' );
				loc.className = 'sdaweb-gcal-mini__popover-event-location';
				loc.textContent = ev.location;
				body.appendChild( loc );
			}

			item.appendChild( body );
			return item;
		}

		function formatDayHeading( dayKey, cell ) {
			if ( cell ) {
				var raw = cell.getAttribute( 'aria-label' );
				if ( raw ) {
					var dashIdx = raw.indexOf( ' — ' );
					return dashIdx > -1 ? raw.slice( 0, dashIdx ) : raw;
				}
			}
			// Day is outside the visible 6-week grid (e.g. an upcoming event in
			// the next month). Format the YYYY-MM-DD as a localized string so
			// the panel title still reads naturally.
			var parts = dayKey.split( '-' );
			if ( parts.length === 3 ) {
				try {
					var d = new Date( parseInt( parts[0], 10 ), parseInt( parts[1], 10 ) - 1, parseInt( parts[2], 10 ) );
					if ( ! isNaN( d.getTime() ) ) {
						return d.toLocaleDateString( undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' } );
					}
				} catch ( e ) {}
			}
			return dayKey;
		}

		function clearChildren( node ) {
			while ( node.firstChild ) {
				node.removeChild( node.firstChild );
			}
		}
	}

	if ( document.readyState === 'loading' ) {
		document.addEventListener( 'DOMContentLoaded', init );
	} else {
		init();
	}

	// v0.13.2: after swap.js replaces a calendar root's innerHTML, the panel,
	// grid, cells and load-more nodes are fresh DOM elements with no listeners.
	// The `__sdawebGcalMiniBound` flag on the persistent root would otherwise
	// short-circuit setup(); clear it on the swapped root so setup() rebinds.
	document.addEventListener( 'sdaweb-gcal:viewchanged', function ( event ) {
		var root = event.target;
		if ( root && root.__sdawebGcalMiniBound ) {
			delete root.__sdawebGcalMiniBound;
		}
		init();
	} );
}() );
