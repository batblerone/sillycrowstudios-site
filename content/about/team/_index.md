+++
title = "The Team"
# The groups below are sections of their own; this one only holds the heading, intro and roles.
render = false
in_search_index = false
sort_by = "weight"
# Zola still gives every person a URL (/about/team/<group>/<name>/); this template
# turns it into a redirect to their card on the about page.
page_template = "team-member.html"

[extra]
# anchor = "team"   # defaults to the slugified title

# Role legend. Roles listed on a person are coloured by the matching entry here
# (an exact `name`, or any role starting with `prefix`). Entries with a
# `description` are also listed above the cards, like Bevy's "Roles" section.
[[extra.roles]]
name = "Founder"
color = "rgb(214, 162, 32)"
description = "started Silly Crow Studios and decides where it flies next."

[[extra.roles]]
name = "Programmer"
color = "rgb(92, 142, 255)"
description = "write the Rust that makes the games go."

[[extra.roles]]
name = "Artist"
color = "rgb(214, 92, 224)"
description = "draw, model and animate everything you see."

[[extra.roles]]
name = "Audio"
color = "rgb(46, 170, 110)"
description = "make the music and sound effects."

# A prefix entry: "Playtester-Web", "Playtester-Desktop", … all share this colour.
[[extra.roles]]
name = "Playtester"
prefix = "Playtester"
color = "rgb(230, 120, 60)"
+++

The people behind the Studios
