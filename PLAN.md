I want to build an web application where users can create forms that can be shared with others and can collect whis way information about people and in the end build a friend-book out of that. 

I want to just brainstorm about the product with you, so no implementation yet. 

Usecases: personal Birthday Gifts, Farewell Gifts for work-colleagues

Basic workflow:

* a user (organizer) creates a account in the tool
* the organizer creates a form in a form builder for the project
* form items always consist out of a question and then user can select answer type. Can be single line text, multi-line text (markdown?), radio-buttons, checkboxes, file uploads (can be limited to how much files per form fill-out), Links
* when finished, ther organizer can save the project and generate a link for it. Link is randomized and not guessable
* the organizer shares the link with the group of people who should fill out the form
* user (form-filler) opens the link and can directly fill out the form without any login
* they can submit in the end the form
* the organizer can at any point decide to close the submit-phase of the form and start working on the project
* the organizer can now build "pages" which are layouts for the generated book in the end
* one form-submit results in one page
* different layouts can be used so the book results in a little mix&match design
* a layout means the organizer can define on an a5 landscape page where the results of the different form-items are placed. An example: Form-Item Name. User can "add" the element from a sidebar to the layout, can also configure in the sidebar if a label should be added, font-size, font-color, font-style. The element is then positioned on a visually-edit drag-and-drop editable-canvas. The user can arrange the element on the page where he wants. The user can also remove the element on the page. The user can select the item and change the settings (font-size etc) at any time via selecting the item and changing it in the sidebar. For images there is the possibility to define "single-images" or "gallary" elements, which are basically e.g. 2 poortrait photos next to each each other, 4 squares etc
* the user can define as many layout as he wants
* after layouts are defined user can change the tab and "fill book" which then generates one filled-out layout page with each form submission. the layouts cycle through or are in a random order, depending on what the user selects
* the user can "regenerate" the pages of the selected layouts do not fit for him
* the user can alsways change the tab and go back to editing the layouts. Editing a layout "invalidates" the generated pages, so they have to be regenerated
* in the end, the user is able to export the pages as PDF

Technology:

* Bun Server with Tanstack Start
* Tanstack query
* tailwind v4, shadcn, https://www.cult-ui.com/
* locally rustfs as s3 client, prod does not need to be configured yet
* postgresql + drizzle
* clerk for auth (no need to set that up yet)
* typescript
* oxlint, oxfmt


Other things:
* I want an aesthetic landing page
* cult-ui should be prefered use, fall back to shadCN components
* rustfs & postgres should run locally in docker-compose
* light & dark mode with a toggle
* during form-submits, the state is persisted in local-storage as autosave, so when people close the page, data is not lost
* during layout-editing & defining the form, state is persisted via autosave on the server with a debounce


Direct questions:
* what options to we have to the visual layout editor? can you research technologies/libraries etc we can use the web for this?
* What do you think of this plan? what do you have relevant questions for? what should we clarify upfront?
