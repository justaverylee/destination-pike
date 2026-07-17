( function ( wp ) {
	'use strict';

	if ( ! wp || ! wp.blocks || ! wp.element ) {
		return;
	}

	const { registerBlockType } = wp.blocks;
	const { createElement: el, Fragment, useEffect, useState } = wp.element;
	const { InspectorControls, useBlockProps } = wp.blockEditor;
	const {
		PanelBody,
		SelectControl,
		TextControl,
		TextareaControl,
		ToggleControl,
		Notice,
	} = wp.components;
	const { __ } = wp.i18n;
	const ServerSideRender = wp.serverSideRender;

	const config = window.sdawebGcalBlock || {};
	const savedDisplays = Array.isArray( config.displays ) ? config.displays : [];
	const savedCalendars = Array.isArray( config.calendars ) ? config.calendars : [];

	function buildDisplayOptions() {
		const options = [
			{ value: '', label: __( '— Use inline configuration —', 'sdaweb-gcal-sync' ) },
		];
		savedDisplays.forEach( function ( d ) {
			options.push( { value: d.slug, label: d.label } );
		} );
		return options;
	}

	function buildViewOptions() {
		return [
			{ value: 'list', label: __( 'List / Agenda', 'sdaweb-gcal-sync' ) },
			{ value: 'month', label: __( 'Month grid', 'sdaweb-gcal-sync' ) },
			{ value: 'card', label: __( 'Card grid', 'sdaweb-gcal-sync' ) },
			{ value: 'week', label: __( 'Week', 'sdaweb-gcal-sync' ) },
			{ value: 'day', label: __( 'Day', 'sdaweb-gcal-sync' ) },
			{ value: 'mini', label: __( 'Mini-month (sidebar / widget)', 'sdaweb-gcal-sync' ) },
			{ value: 'upcoming', label: __( 'Upcoming events (sidebar / widget)', 'sdaweb-gcal-sync' ) },
		];
	}

	function buildGroupOptions() {
		return [
			{ value: 'day', label: __( 'Group by day', 'sdaweb-gcal-sync' ) },
			{ value: 'month', label: __( 'Group by month', 'sdaweb-gcal-sync' ) },
			{ value: 'month_with_weeks', label: __( 'Group by month with week sub-headings', 'sdaweb-gcal-sync' ) },
			{ value: 'none', label: __( 'No grouping', 'sdaweb-gcal-sync' ) },
		];
	}

	function buildDarkModeOptions() {
		return [
			{ value: 'auto', label: __( 'Auto (follow site)', 'sdaweb-gcal-sync' ) },
			{ value: 'light', label: __( 'Always light', 'sdaweb-gcal-sync' ) },
			{ value: 'dark', label: __( 'Always dark', 'sdaweb-gcal-sync' ) },
		];
	}

	function buildLinkTargetOptions() {
		return [
			{ value: 'same', label: __( 'Same window', 'sdaweb-gcal-sync' ) },
			{ value: 'new', label: __( 'New tab', 'sdaweb-gcal-sync' ) },
		];
	}

	function buildRangeModeOptions() {
		return [
			{ value: 'rolling', label: __( 'Rolling window', 'sdaweb-gcal-sync' ) },
			{ value: 'preset', label: __( 'Quick preset', 'sdaweb-gcal-sync' ) },
			{ value: 'custom', label: __( 'Custom date range', 'sdaweb-gcal-sync' ) },
		];
	}

	function buildRangePresetOptions() {
		return [
			{ value: '', label: __( '— Choose a preset —', 'sdaweb-gcal-sync' ) },
			{ value: 'today', label: __( 'Today', 'sdaweb-gcal-sync' ) },
			{ value: 'tomorrow', label: __( 'Tomorrow', 'sdaweb-gcal-sync' ) },
			{ value: 'this_week', label: __( 'This week', 'sdaweb-gcal-sync' ) },
			{ value: 'next_week', label: __( 'Next week', 'sdaweb-gcal-sync' ) },
			{ value: 'this_month', label: __( 'This month', 'sdaweb-gcal-sync' ) },
			{ value: 'next_month', label: __( 'Next month', 'sdaweb-gcal-sync' ) },
			{ value: 'next_7_days', label: __( 'Next 7 days', 'sdaweb-gcal-sync' ) },
			{ value: 'next_30_days', label: __( 'Next 30 days', 'sdaweb-gcal-sync' ) },
			{ value: 'next_90_days', label: __( 'Next 90 days', 'sdaweb-gcal-sync' ) },
			{ value: 'next_year', label: __( 'Next 12 months', 'sdaweb-gcal-sync' ) },
			{ value: 'past_7_days', label: __( 'Past 7 days', 'sdaweb-gcal-sync' ) },
			{ value: 'past_30_days', label: __( 'Past 30 days', 'sdaweb-gcal-sync' ) },
			{ value: 'past_90_days', label: __( 'Past 90 days', 'sdaweb-gcal-sync' ) },
			{ value: 'past_year', label: __( 'Past 12 months', 'sdaweb-gcal-sync' ) },
			{ value: 'this_year', label: __( 'This year', 'sdaweb-gcal-sync' ) },
			{ value: 'last_year', label: __( 'Last year', 'sdaweb-gcal-sync' ) },
		];
	}

	function Edit( props ) {
		const { attributes, setAttributes } = props;
		const blockProps = useBlockProps();

		const usingSavedDisplay = !! attributes.displayId;

		const inspector = el(
			InspectorControls,
			null,
			el(
				PanelBody,
				{ title: __( 'Source', 'sdaweb-gcal-sync' ), initialOpen: true },
				el( SelectControl, {
					label: __( 'Saved display', 'sdaweb-gcal-sync' ),
					value: attributes.displayId || '',
					options: buildDisplayOptions(),
					help: __( 'Pick a saved display from Settings → SDAweb Calendar Sync, or leave blank to configure inline below.', 'sdaweb-gcal-sync' ),
					onChange: function ( value ) {
						setAttributes( { displayId: value } );
					},
				} ),
				usingSavedDisplay
					? el( Notice, { status: 'info', isDismissible: false }, __( 'Inline options are ignored when a saved display is selected.', 'sdaweb-gcal-sync' ) )
					: null,
				! usingSavedDisplay && el( TextareaControl, {
					label: __( 'Calendars (comma-separated slugs)', 'sdaweb-gcal-sync' ),
					value: attributes.calendars || '',
					help: savedCalendars.length > 0
						? __( 'Available slugs: ', 'sdaweb-gcal-sync' ) + savedCalendars.map( function ( c ) { return c.slug; } ).join( ', ' )
						: __( 'No calendars are configured yet. Go to Settings → SDAweb Calendar Sync → Calendars first.', 'sdaweb-gcal-sync' ),
					onChange: function ( value ) {
						setAttributes( { calendars: value } );
					},
				} )
			),
			! usingSavedDisplay && el(
				PanelBody,
				{ title: __( 'View', 'sdaweb-gcal-sync' ), initialOpen: false },
				el( SelectControl, {
					label: __( 'View type', 'sdaweb-gcal-sync' ),
					value: attributes.view || 'list',
					options: buildViewOptions(),
					onChange: function ( value ) {
						setAttributes( { view: value } );
					},
				} ),
				el( SelectControl, {
					label: __( 'Group events', 'sdaweb-gcal-sync' ),
					value: attributes.group || 'day',
					options: buildGroupOptions(),
					onChange: function ( value ) {
						setAttributes( { group: value } );
					},
				} ),
				el( SelectControl, {
					label: __( 'Date range mode', 'sdaweb-gcal-sync' ),
					value: attributes.rangeMode || 'rolling',
					options: buildRangeModeOptions(),
					help: __( 'Rolling = anchor + days back/forward. Preset = named period. Custom = fixed start + end.', 'sdaweb-gcal-sync' ),
					onChange: function ( value ) { setAttributes( { rangeMode: value } ); },
				} ),
				( ! attributes.rangeMode || 'rolling' === attributes.rangeMode ) && el( TextControl, {
					label: __( 'Days forward', 'sdaweb-gcal-sync' ),
					type: 'number',
					min: 0,
					max: 730,
					value: attributes.days != null ? attributes.days : 30,
					onChange: function ( value ) { setAttributes( { days: parseInt( value, 10 ) || 0 } ); },
				} ),
				( ! attributes.rangeMode || 'rolling' === attributes.rangeMode ) && el( TextControl, {
					label: __( 'Days back', 'sdaweb-gcal-sync' ),
					type: 'number',
					min: 0,
					max: 730,
					value: attributes.daysBack != null ? attributes.daysBack : 0,
					onChange: function ( value ) { setAttributes( { daysBack: parseInt( value, 10 ) || 0 } ); },
				} ),
				( ! attributes.rangeMode || 'rolling' === attributes.rangeMode ) && el( TextControl, {
					label: __( 'Anchor date (optional)', 'sdaweb-gcal-sync' ),
					type: 'date',
					value: attributes.startDate || '',
					onChange: function ( value ) { setAttributes( { startDate: value || '' } ); },
				} ),
				'preset' === attributes.rangeMode && el( SelectControl, {
					label: __( 'Quick preset', 'sdaweb-gcal-sync' ),
					value: attributes.rangePreset || '',
					options: buildRangePresetOptions(),
					onChange: function ( value ) { setAttributes( { rangePreset: value } ); },
				} ),
				'custom' === attributes.rangeMode && el( TextControl, {
					label: __( 'Start date', 'sdaweb-gcal-sync' ),
					type: 'date',
					value: attributes.startDate || '',
					onChange: function ( value ) { setAttributes( { startDate: value || '' } ); },
				} ),
				'custom' === attributes.rangeMode && el( TextControl, {
					label: __( 'End date', 'sdaweb-gcal-sync' ),
					type: 'date',
					value: attributes.endDate || '',
					onChange: function ( value ) { setAttributes( { endDate: value || '' } ); },
				} ),
				el( TextControl, {
					label: __( 'Max events', 'sdaweb-gcal-sync' ),
					type: 'number',
					min: 1,
					max: 500,
					value: attributes.max || 50,
					onChange: function ( value ) {
						setAttributes( { max: parseInt( value, 10 ) || 50 } );
					},
				} )
			),
			! usingSavedDisplay && el(
				PanelBody,
				{ title: __( 'Display options', 'sdaweb-gcal-sync' ), initialOpen: false },
				el( ToggleControl, {
					label: __( 'Show end time', 'sdaweb-gcal-sync' ),
					checked: !! attributes.showEnd,
					onChange: function ( value ) { setAttributes( { showEnd: !! value } ); },
				} ),
				el( ToggleControl, {
					label: __( 'Show calendar badge', 'sdaweb-gcal-sync' ),
					checked: !! attributes.showCalendar,
					onChange: function ( value ) { setAttributes( { showCalendar: !! value } ); },
				} ),
				el( ToggleControl, {
					label: __( 'Show location', 'sdaweb-gcal-sync' ),
					checked: !! attributes.showLocation,
					onChange: function ( value ) { setAttributes( { showLocation: !! value } ); },
				} ),
				el( ToggleControl, {
					label: __( 'Show description', 'sdaweb-gcal-sync' ),
					checked: !! attributes.showDescription,
					onChange: function ( value ) { setAttributes( { showDescription: !! value } ); },
				} ),
				attributes.showDescription && el( TextControl, {
					label: __( 'Description word limit', 'sdaweb-gcal-sync' ),
					type: 'number',
					min: 0,
					max: 200,
					value: attributes.descriptionWords || 30,
					help: __( '0 disables truncation.', 'sdaweb-gcal-sync' ),
					onChange: function ( value ) {
						setAttributes( { descriptionWords: parseInt( value, 10 ) || 0 } );
					},
				} ),
				el( SelectControl, {
					label: __( 'Time format', 'sdaweb-gcal-sync' ),
					value: attributes.timeFormatMode || 'site',
					options: [
						{ value: 'site', label: __( 'Follow site setting', 'sdaweb-gcal-sync' ) },
						{ value: '24h', label: __( '24-hour (15:30)', 'sdaweb-gcal-sync' ) },
						{ value: '12h', label: __( '12-hour (3:30 pm)', 'sdaweb-gcal-sync' ) },
					],
					onChange: function ( value ) { setAttributes( { timeFormatMode: value } ); },
				} ),
				el( SelectControl, {
					label: __( 'First day of week', 'sdaweb-gcal-sync' ),
					value: attributes.firstDayOfWeek || 'site',
					options: [
						{ value: 'site', label: __( 'Follow site setting', 'sdaweb-gcal-sync' ) },
						{ value: 'mon', label: __( 'Monday', 'sdaweb-gcal-sync' ) },
						{ value: 'sun', label: __( 'Sunday', 'sdaweb-gcal-sync' ) },
						{ value: 'sat', label: __( 'Saturday', 'sdaweb-gcal-sync' ) },
					],
					onChange: function ( value ) { setAttributes( { firstDayOfWeek: value } ); },
				} ),
				el( ToggleControl, {
					label: __( 'Show week numbers (ISO 8601)', 'sdaweb-gcal-sync' ),
					checked: !! attributes.showWeekNumbers,
					onChange: function ( value ) { setAttributes( { showWeekNumbers: !! value } ); },
				} ),
				el( SelectControl, {
					label: __( 'Recurring-event indicator', 'sdaweb-gcal-sync' ),
					value: attributes.recurrenceIndicator || 'icon',
					options: [
						{ value: 'none', label: __( 'Hide', 'sdaweb-gcal-sync' ) },
						{ value: 'icon', label: __( 'Small icon next to title', 'sdaweb-gcal-sync' ) },
						{ value: 'icon_text', label: __( 'Icon + recurrence summary text', 'sdaweb-gcal-sync' ) },
					],
					onChange: function ( value ) { setAttributes( { recurrenceIndicator: value } ); },
				} ),
				el( SelectControl, {
					label: __( 'List view: week-grouped heading', 'sdaweb-gcal-sync' ),
					value: attributes.listWeekHeading || 'number',
					options: [
						{ value: 'number', label: __( 'Week number only ("Week 33")', 'sdaweb-gcal-sync' ) },
						{ value: 'date', label: __( 'Date only ("Week of 11 August 2025")', 'sdaweb-gcal-sync' ) },
						{ value: 'both', label: __( 'Both ("Week 33 — 11 August 2025")', 'sdaweb-gcal-sync' ) },
					],
					help: __( 'Only applies when the List view is grouped by week.', 'sdaweb-gcal-sync' ),
					onChange: function ( value ) { setAttributes( { listWeekHeading: value } ); },
				} ),
				el( SelectControl, {
					label: __( 'List view: day-grouped heading', 'sdaweb-gcal-sync' ),
					value: attributes.listHeadingStyle || 'relative',
					options: [
						{ value: 'relative', label: __( 'Relative label only ("Today" / "Tomorrow" / "Friday 15 May")', 'sdaweb-gcal-sync' ) },
						{ value: 'date', label: __( 'Date only ("Saturday 2 May 2026")', 'sdaweb-gcal-sync' ) },
						{ value: 'both', label: __( 'Both ("Tomorrow — Saturday 2 May 2026")', 'sdaweb-gcal-sync' ) },
					],
					help: __( 'Only applies when the List view is grouped by day.', 'sdaweb-gcal-sync' ),
					onChange: function ( value ) { setAttributes( { listHeadingStyle: value } ); },
				} )
			),
			! usingSavedDisplay && el(
				PanelBody,
				{ title: __( 'Filters', 'sdaweb-gcal-sync' ), initialOpen: false },
				el( ToggleControl, {
					label: __( 'Hide past events', 'sdaweb-gcal-sync' ),
					checked: !! attributes.hidePast,
					onChange: function ( value ) { setAttributes( { hidePast: !! value } ); },
				} ),
				el( ToggleControl, {
					label: __( 'Hide all-day events', 'sdaweb-gcal-sync' ),
					checked: !! attributes.hideAllDay,
					onChange: function ( value ) { setAttributes( { hideAllDay: !! value } ); },
				} ),
				el( ToggleControl, {
					label: __( 'Hide cancelled events', 'sdaweb-gcal-sync' ),
					checked: !! attributes.hideCancelled,
					onChange: function ( value ) { setAttributes( { hideCancelled: !! value } ); },
				} ),
				el( TextControl, {
					label: __( 'Search filter', 'sdaweb-gcal-sync' ),
					value: attributes.search || '',
					help: __( 'Plain-text match against title, location, and description.', 'sdaweb-gcal-sync' ),
					onChange: function ( value ) { setAttributes( { search: value } ); },
				} )
			),
			! usingSavedDisplay && el(
				PanelBody,
				{ title: __( 'Style', 'sdaweb-gcal-sync' ), initialOpen: false },
				el( TextControl, {
					label: __( 'Primary color (hex, optional)', 'sdaweb-gcal-sync' ),
					value: attributes.primaryColor || '',
					placeholder: '#2271b1',
					onChange: function ( value ) { setAttributes( { primaryColor: value } ); },
				} ),
				el( TextControl, {
					label: __( 'Accent color (hex, optional)', 'sdaweb-gcal-sync' ),
					value: attributes.accentColor || '',
					placeholder: '#3a87ad',
					onChange: function ( value ) { setAttributes( { accentColor: value } ); },
				} ),
				el( TextControl, {
					label: __( 'Today highlight color (hex, optional)', 'sdaweb-gcal-sync' ),
					value: attributes.todayColor || '',
					placeholder: '#2271b1',
					help: __( 'Used to highlight today across Month, Week, Day, and Mini-month views. Leave blank to use the primary color.', 'sdaweb-gcal-sync' ),
					onChange: function ( value ) { setAttributes( { todayColor: value } ); },
				} ),
				el( TextControl, {
					label: __( 'Link color (hex, optional)', 'sdaweb-gcal-sync' ),
					value: attributes.linkColor || '',
					placeholder: '',
					help: __( 'Override link color across the calendar. Leave blank to inherit text color.', 'sdaweb-gcal-sync' ),
					onChange: function ( value ) { setAttributes( { linkColor: value } ); },
				} ),
				el( TextControl, {
					label: __( 'Event color override (hex, optional)', 'sdaweb-gcal-sync' ),
					value: attributes.eventColorOverride || '',
					placeholder: '',
					help: __( 'Override the accent color used for event indicators (date column in Upcoming, chip accents in List, dots in Mini-month, ribbons in Month/Week, etc.). Leave blank to inherit each event’s Calendar Color.', 'sdaweb-gcal-sync' ),
					onChange: function ( value ) { setAttributes( { eventColorOverride: value } ); },
				} ),
				el( SelectControl, {
					label: __( 'Dark mode', 'sdaweb-gcal-sync' ),
					value: attributes.darkMode || 'auto',
					options: buildDarkModeOptions(),
					onChange: function ( value ) { setAttributes( { darkMode: value } ); },
				} ),
				el( SelectControl, {
					label: __( 'Open event links in', 'sdaweb-gcal-sync' ),
					value: attributes.linkTarget || 'same',
					options: buildLinkTargetOptions(),
					help: __( 'Where event links (to Google Calendar) open when a visitor clicks them.', 'sdaweb-gcal-sync' ),
					onChange: function ( value ) { setAttributes( { linkTarget: value } ); },
				} ),
				el( SelectControl, {
					label: __( 'Hover popover on event chips', 'sdaweb-gcal-sync' ),
					value: attributes.eventHover || 'rich',
					options: [
						{ value: 'rich', label: __( 'Rich — date, time, title, location, description', 'sdaweb-gcal-sync' ) },
						{ value: 'minimal', label: __( 'Minimal — date and title only', 'sdaweb-gcal-sync' ) },
						{ value: 'none', label: __( 'Off — native browser tooltip only', 'sdaweb-gcal-sync' ) },
					],
					help: __( 'Applies to Month, Week, and Mini-month event chips. Desktop hover/keyboard focus only.', 'sdaweb-gcal-sync' ),
					onChange: function ( value ) { setAttributes( { eventHover: value } ); },
				} ),
				el( SelectControl, {
					label: __( 'Today highlight style (Month view)', 'sdaweb-gcal-sync' ),
					value: attributes.todayStyle || 'column',
					options: [
						{ value: 'cell', label: __( 'Cell only', 'sdaweb-gcal-sync' ) },
						{ value: 'column', label: __( "Whole column (default)", 'sdaweb-gcal-sync' ) },
					],
					onChange: function ( value ) { setAttributes( { todayStyle: value } ); },
				} ),
				el( SelectControl, {
					label: __( 'Time placement (List/Day/Card rows)', 'sdaweb-gcal-sync' ),
					value: attributes.timePlacement || 'beside_date',
					options: [
						{ value: 'beside_date', label: __( 'Beside date (stacked under the date pill, default)', 'sdaweb-gcal-sync' ) },
						{ value: 'below_title', label: __( 'Below title (small meta line under the title)', 'sdaweb-gcal-sync' ) },
						{ value: 'inline_before_title', label: __( 'Inline before title (Google / Apple style)', 'sdaweb-gcal-sync' ) },
					],
					help: __( 'Sparse rows read best with Beside date. Content-rich rows read best with Below title. Inline before title is compact for dense daily agendas.', 'sdaweb-gcal-sync' ),
					onChange: function ( value ) { setAttributes( { timePlacement: value } ); },
				} ),
				el( SelectControl, {
					label: __( 'List view: event row style', 'sdaweb-gcal-sync' ),
					// Fall back to the pre-split legacy `chipStyle` so an
					// un-migrated block shows its real effective value (and a save
					// doesn't silently reset it).
					value: attributes.listChipStyle || ( [ 'linear', 'boxed', 'card' ].indexOf( attributes.chipStyle ) !== -1 ? attributes.chipStyle : 'linear' ),
					options: [
						{ value: 'linear', label: __( 'Linear — left edge accent, no box (default)', 'sdaweb-gcal-sync' ) },
						{ value: 'boxed', label: __( 'Boxed — light border around each event', 'sdaweb-gcal-sync' ) },
						{ value: 'card', label: __( 'Elevated — soft shadow, surface background', 'sdaweb-gcal-sync' ) },
					],
					help: __( 'How each event row looks in the List / Agenda view. No effect on other views.', 'sdaweb-gcal-sync' ),
					onChange: function ( value ) { setAttributes( { listChipStyle: value } ); },
				} ),
				el( SelectControl, {
					label: __( 'Month view: event chip style', 'sdaweb-gcal-sync' ),
					value: attributes.monthChipStyle || ( [ 'solid', 'pastel' ].indexOf( attributes.chipStyle ) !== -1 ? attributes.chipStyle : 'solid' ),
					options: [
						{ value: 'solid', label: __( 'Solid — feed color background, white text (default)', 'sdaweb-gcal-sync' ) },
						{ value: 'pastel', label: __( 'Pastel — soft tint, colored left border', 'sdaweb-gcal-sync' ) },
					],
					help: __( 'How event chips look in the Month grid. Pastel makes multi-feed Month displays much more legible. No effect on other views.', 'sdaweb-gcal-sync' ),
					onChange: function ( value ) { setAttributes( { monthChipStyle: value } ); },
				} ),
				el( SelectControl, {
					label: __( 'List view: heading position', 'sdaweb-gcal-sync' ),
					value: attributes.listHeadingPosition || 'inline',
					options: [
						{ value: 'inline', label: __( 'Inline — heading above events with bottom border (default)', 'sdaweb-gcal-sync' ) },
						{ value: 'pill-left', label: __( 'Pill — inverted block at top-left with extending line', 'sdaweb-gcal-sync' ) },
						{ value: 'centered', label: __( 'Centered — heading centered with ornament below', 'sdaweb-gcal-sync' ) },
					],
					onChange: function ( value ) { setAttributes( { listHeadingPosition: value } ); },
				} ),
				el( SelectControl, {
					label: __( 'Card view: grouping', 'sdaweb-gcal-sync' ),
					value: attributes.cardGrouping || 'none',
					options: [
						{ value: 'none',  label: __( 'Off — flat grid', 'sdaweb-gcal-sync' ) },
						{ value: 'day',   label: __( 'By day', 'sdaweb-gcal-sync' ) },
						{ value: 'week',  label: __( 'By week (ISO 8601)', 'sdaweb-gcal-sync' ) },
						{ value: 'month', label: __( 'By month', 'sdaweb-gcal-sync' ) },
					],
					help: __( 'Insert a heading between cards when the date crosses a day, ISO week, or calendar-month boundary. Off by default.', 'sdaweb-gcal-sync' ),
					onChange: function ( value ) { setAttributes( { cardGrouping: value } ); },
				} ),
				el( SelectControl, {
					label: __( 'Month view: day overflow ("+N more")', 'sdaweb-gcal-sync' ),
					value: attributes.monthOverflowAction || 'popover',
					options: [
						{ value: 'popover', label: __( 'Show a popover with the day\'s full list (default)', 'sdaweb-gcal-sync' ) },
						{ value: 'day',     label: __( 'Open the Day view for that date', 'sdaweb-gcal-sync' ) },
					],
					help: __( 'When a day cell has more events than fit, "+N more" appears at the bottom of the cell. Popover keeps the visitor in the month view; Day view opens a dedicated page for that date with full event detail.', 'sdaweb-gcal-sync' ),
					onChange: function ( value ) { setAttributes( { monthOverflowAction: value } ); },
				} ),
				el( ToggleControl, {
					label: __( 'Show live search input', 'sdaweb-gcal-sync' ),
					checked: !! attributes.showSearch,
					onChange: function ( value ) { setAttributes( { showSearch: !! value } ); },
				} ),
				el( ToggleControl, {
					label: __( 'Show "jump to date" picker', 'sdaweb-gcal-sync' ),
					checked: !! attributes.showDatePicker,
					onChange: function ( value ) { setAttributes( { showDatePicker: !! value } ); },
				} ),
				el( TextControl, {
					label: __( 'Locale override (optional)', 'sdaweb-gcal-sync' ),
					value: attributes.locale || '',
					placeholder: 'nb_NO',
					help: __( 'Force this calendar to render in a specific locale (e.g. nb_NO). Leave blank to follow the site language.', 'sdaweb-gcal-sync' ),
					onChange: function ( value ) { setAttributes( { locale: value } ); },
				} ),
				el( ToggleControl, {
					label: __( 'Show view toggle on the front end', 'sdaweb-gcal-sync' ),
					checked: !! attributes.viewToggle,
					help: __( 'Adds a pill-group switcher above the calendar so visitors can change view themselves.', 'sdaweb-gcal-sync' ),
					onChange: function ( value ) { setAttributes( { viewToggle: !! value } ); },
				} ),
				attributes.viewToggle && el( TextControl, {
					label: __( 'Views in toggle (comma-separated)', 'sdaweb-gcal-sync' ),
					value: attributes.viewToggleViews || 'list,month,card',
					help: __( 'Pick from: list, month, card, week, day. At least 2 to render.', 'sdaweb-gcal-sync' ),
					onChange: function ( value ) { setAttributes( { viewToggleViews: value } ); },
				} ),
				attributes.viewToggle && el( SelectControl, {
					label: __( 'Toggle position', 'sdaweb-gcal-sync' ),
					value: attributes.viewTogglePosition || 'top-right',
					options: [
						{ value: 'top-right', label: __( 'Top right', 'sdaweb-gcal-sync' ) },
						{ value: 'top-left', label: __( 'Top left', 'sdaweb-gcal-sync' ) },
						{ value: 'top-center', label: __( 'Top center', 'sdaweb-gcal-sync' ) },
					],
					onChange: function ( value ) { setAttributes( { viewTogglePosition: value } ); },
				} ),
				el( SelectControl, {
					label: __( 'Subscribe button (ICS)', 'sdaweb-gcal-sync' ),
					value: attributes.icsSubscribe || 'none',
					options: [
						{ value: 'none', label: __( 'Hide', 'sdaweb-gcal-sync' ) },
						{ value: 'button', label: __( 'Pill button beside view toggle', 'sdaweb-gcal-sync' ) },
						{ value: 'inline', label: __( 'Inline (compact)', 'sdaweb-gcal-sync' ) },
					],
					help: __( 'Adds a "Subscribe" dropdown with one-click hand-offs to Google Calendar (web), Apple/Outlook (webcal), Android Google Calendar app, and copy-link.', 'sdaweb-gcal-sync' ),
					onChange: function ( value ) { setAttributes( { icsSubscribe: value } ); },
				} ),
				el( SelectControl, {
					label: __( 'Mobile fallback', 'sdaweb-gcal-sync' ),
					value: attributes.mobileDegrade || 'auto',
					options: [
						{ value: 'auto', label: __( 'Auto — show mini-month grid on phones', 'sdaweb-gcal-sync' ) },
						{ value: 'none', label: __( 'None — keep the full grid', 'sdaweb-gcal-sync' ) },
					],
					help: __( 'For Month view: swap to mini-month with today + upcoming panel under ~600px.', 'sdaweb-gcal-sync' ),
					onChange: function ( value ) { setAttributes( { mobileDegrade: value } ); },
				} ),
				el( SelectControl, {
					label: __( 'Mini-month: events panel', 'sdaweb-gcal-sync' ),
					value: attributes.miniDefaultPanel || 'today_upcoming',
					options: [
						{ value: 'today_upcoming', label: __( 'Show today + upcoming below the grid', 'sdaweb-gcal-sync' ) },
						{ value: 'none', label: __( 'Empty until a day is clicked', 'sdaweb-gcal-sync' ) },
					],
					onChange: function ( value ) { setAttributes( { miniDefaultPanel: value } ); },
				} ),
				el( TextControl, {
					label: __( 'Mini-month: upcoming events to prefetch', 'sdaweb-gcal-sync' ),
					type: 'number',
					min: 4,
					max: 100,
					value: attributes.miniUpcomingMax != null ? attributes.miniUpcomingMax : 30,
					onChange: function ( value ) { setAttributes( { miniUpcomingMax: parseInt( value, 10 ) || 30 } ); },
				} ),
				el( TextControl, {
					label: __( 'Mini-month: link to full calendar (URL)', 'sdaweb-gcal-sync' ),
					type: 'url',
					value: attributes.miniFullUrl || '',
					placeholder: 'https://example.com/calendar/',
					onChange: function ( value ) { setAttributes( { miniFullUrl: value } ); },
				} ),
				el( TextControl, {
					label: __( 'Mini-month: link label', 'sdaweb-gcal-sync' ),
					value: attributes.miniFullLabel || '',
					placeholder: __( 'View full calendar', 'sdaweb-gcal-sync' ),
					onChange: function ( value ) { setAttributes( { miniFullLabel: value } ); },
				} )
			)
		);

		const preview = ServerSideRender
			? el( ServerSideRender, {
				block: 'sdaweb-gcal/calendar',
				attributes: attributes,
				EmptyResponsePlaceholder: function () {
					return el(
						'div',
						{ className: 'sdaweb-gcal-block-empty' },
						__( 'No events to display. Configure source on the right, or check your calendar settings.', 'sdaweb-gcal-sync' )
					);
				},
			} )
			: el( 'div', { className: 'sdaweb-gcal-block-empty' }, __( 'Server-side preview not available.', 'sdaweb-gcal-sync' ) );

		return el( Fragment, null, inspector, el( 'div', blockProps, preview ) );
	}

	registerBlockType( 'sdaweb-gcal/calendar', {
		edit: Edit,
		save: function () {
			return null;
		},
	} );
} )( window.wp );
