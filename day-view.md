## Let's work the new look for the Day view.

First off, remove the Flexible plan UI from the top of the week tab and page tab. It is confusing and cramped. Keep the data structure as it is now, that will work for what we are building. 

### Day View
- Rather than a truncated version of the week view, the day view will be a full-width view that shows all items for the day in a scrollable list.
- The list will be similar to the itinerary page, but with more detailed information about each event.
- A good reference will be Wanderlog, which has a similar day view. I have included a reference in wanderlog.jpg. Refer to it.
- The important parts to replicate is the numbered list of places to visit. 
  - Replicate it with the same visual design as the rest of the app.
- As well as the lack of fixed timing grid.
- Items with actual fixed time and length will have a fixed position on the timeline.
  - They will also have the starting time listed at the left side.
- Naturally, all day items will be positioned at the top of the list
- Users will be able to hover their mouse in the gaps between items, and a faint dotted line will appear to prompt the user to add a new item at that location.

### Week View
- The week view will be a standard calendar week view, but we have to incorporate items with nebulous start and end timings.
- To do this, we will use items with fixed time as length on the timeline as anchors. Any items with nebulous start and end timings will be positioned relative to these anchors.
- For example, if I have an item at 9:00 am to 10:00 am, and another at 12pm, any items that are placed between these two will be stretched to fill the space between them.
- if i have 5 items, they will be stretched to fill the space between the anchors.
- if I have 1 item, it will be stretched to fill the space between the anchors.
- this chunk of items will now be referred to as "Item block"
- if there is no item at the the start of the day or the end of the day, the user will be able to drag from the top or the borders of the item block in order to define the start or end of the block, to prevent the block from being stretched till the day boundaries.
- user should be able to drag items within the item block to reorder them.

> dayOrder Int? data structure should be preserved, and apply to the itinerary view as well.


## Misc fixes
- The trips list should not be a dropdown, but a list at the sidebar.