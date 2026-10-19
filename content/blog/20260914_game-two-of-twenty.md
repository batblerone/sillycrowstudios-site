+++
title = "Game Two of Twenty"
date = 2026-09-14
update = 2026-10-18
description = "Game two, and the long road ahead to making something fun."

[taxonomies]
tags = ["bevy", "20 Games Challenge"]
categories = ["Game Dev"]

[extra]
show_toc = false
+++

EDIT: Updated to reflect the change in godot-rust to a pure bevy build of the game.

# Alright, here we go

Game two, check it out on the [projects page](/projects/games/flyaway). This one was a bit much on my end, and it's still not done. Filled with a few bugs, and showing some wear and tear in terms of how it plays. But overall I think I need to move on. This game took long, much longer than pong and I need to learn to be comfortable with letting things go. So for all it's worth this is it. [Fly Away!](https://github.com/batblerone/flyaway.git) a game where a crow has to fly away from their natural enemies, tree branches and great horned owls.

This game was a mit more intensive than my last. Using actual assets and sounds and models, very professional very artistic. And since I am no artist, yet, I sourced a great deal of these assets from the wonderful world of itch. This one was a bit of an experement to say the least. I started in godot-rust, make a working game that has a serious lack of polish, but then though (with the release of bevy 0.20) why not just make it in bevy. I know that godot is production ready, able to ship some amazing games already and there is a lot of skill and talent behind godot. But, I want to make something fun, and I want to force myself to actually learn to code along with all the artistic endavours I am trying out. Just wait for the pixel art travesties I will subject you all to the next game.

Now I used mostly open licence no attribution assets, but attribution should be given for these wonderful products. Such all the assets I used came from the following creators.

- Background from [Meowtastic](https://meowtastic-studio.itch.io/)
- Music from [FarBeyond Studio](https://farbeyond-studio.carrd.co/)
- Sfx from my partner
- Sprites from [SkaldingDelight](https://skalding.itch.io/bush-009-10) for the branches, [SeethingSwarm](https://seethingswarm.itch.io/crowpack) for the crow, [PeakPixels](https://peakpixels.itch.io/owls) for the owls.

For this game, I drew a large amount of my inspiration and guidance from [marcs-sus](https://github.com/marcs-sus/jetpack-joyride) and their implementation of the game. I do like the wizards flying around shooting particles everywhere. Now, I am no where near a state to make particle effects or fancy graphics implementations. Just getting the game to save the high score was hard enough. Working with the serde crate though I eventually bumbled my way through it. Still have much to learn though, at some point I may be good enough to make something akin to the nemisis system, or the alien isolation system, or some sort of save scumming mechanism to make future games more interesting. But that is just me waxing all poetic about a future I don't even know about or care to think of right now.

All in all, I am learning that there is so much that goes into every little aspect of making a game. From the art, to the feel, and to the essence of what the game is it all really matters. So, am I ready for the GMTK jam in 2027? No, not even close. But for now, have fun making a crow fly up and down. This game took me better part of three weeks after the first pong game. Now is that timeline to long for a jetpack joyride clone? Probably, but this is only really my second game I made start to finish. So as I prepare for the crunch that is GMTK next year, lets see if I can cut those production times down.
