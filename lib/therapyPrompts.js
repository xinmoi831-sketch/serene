// lib/therapyPrompts.js
// Therapy context database for Serene AI
// Sources: WHO guidance, CBT principles, trauma-informed care,
// perinatal mental health, Zambia/Southern Africa cultural context
//
// PHILOSOPHY: Human connection first. Guidance second. Education only when asked.
// Response order: Understand → Validate → Connect → Suggest → Guide → Educate
// SERENE must never sound like a textbook. Users come to feel understood, not taught.
"use strict";

const TOPIC_KEYWORDS = {
  depression: [
    'depressed','depression','hopeless','empty','numb','no energy','worthless',
    'crying','sad','don\'t want to be here','no point','thinking too much',
    'nothing matters','can\'t feel anything','suicidal','dark thoughts',
    'can\'t get up','no motivation','feel nothing','life is pointless',
    'tired of everything','no reason to live','feel like a burden'
  ],
  grief: [
    'died','death','passed away','lost','bereaved','grief','grieving',
    'miss them','gone','funeral','mourning','bereavement','widow','widower',
    'they are gone','can\'t accept','still not over it','lost someone',
    'someone died','they passed','no longer here','lost my mother','lost my father',
    'lost my child','lost my husband','lost my wife','lost my friend'
  ],
  relationships: [
    'partner','husband','wife','boyfriend','girlfriend','marriage','divorce',
    'cheating','unfaithful','argument','fighting','communication','trust',
    'relationship','family conflict','in-laws','separated','breaking up',
    'toxic','lonely in marriage','my partner','my spouse',
    'we keep fighting','don\'t feel loved','feel ignored','feel unloved',
    'relationship problems','marriage problems','not happy at home'
  ],
  anxiety: [
    'anxious','anxiety','can\'t stop worrying','panic','panicking','panic attack',
    'heart racing','chest tight','can\'t breathe','overwhelmed','on edge',
    'scared','afraid','fear','nervous','constantly worried','mind won\'t stop',
    'overthinking','what if','can\'t relax','always tense','dread','restless',
    'can\'t sleep from worry','stomach in knots','something bad will happen',
    'feel out of control','worst case scenario','spiraling'
  ],
  trauma: [
    'trauma','traumatized','what happened to me','can\'t forget','keep thinking about it',
    'nightmares','flashback','flashbacks','intrusive thoughts','triggered','trigger',
    'assault','attacked','abused as a child','childhood abuse','sexual abuse',
    'accident','witnessed','ptsd','can\'t move on','stuck in the past',
    'keep reliving','it keeps coming back','won\'t go away','haunting me',
    'can\'t stop seeing it','feel disconnected','feel numb after','dissociated'
  ],
  postpartum: [
    'after birth','after having baby','after delivery','postpartum','postnatal',
    'new mother','new mom','just had a baby','had my baby','gave birth',
    'don\'t feel like myself after','not bonding','can\'t bond with baby',
    'don\'t feel connected to my baby','hate being a mother','not happy after birth',
    'crying all the time after baby','overwhelmed with baby','baby blues',
    'feel like a bad mother','not supposed to feel this way','supposed to be happy',
    'everyone expects me to be happy','can\'t cope with baby','exhausted from baby'
  ],
  abuse: [
    'abusive','he hits me','she hits me','physically abused','being hit','being beaten',
    'he is controlling','she is controlling','my partner is controlling',
    'partner controls me','he controls me','she controls me',
    'controls everything','controls me','coercive','manipulates me',
    'isolates me','won\'t let me see family','won\'t let me see friends',
    'monitors my phone','checks my phone','threatens me','scared of my partner',
    'scared of my husband','scared of my wife','domestic violence','gbv',
    'gender based violence','he threatens','she threatens','can\'t leave',
    'afraid to leave','trapped in relationship','he controls money',
    'financial abuse','emotionally abusive','psychological abuse','gaslighting',
    'makes me feel crazy','feel worthless because of partner'
  ],
  relationship_support: [
    'broke up','we broke up','she left me','he left me','she ended it','he ended it',
    'she wants to break up','he wants to break up','ended our relationship',
    'we split up','we are over','it\'s over between us',
    'said she doesn\'t love me','said he doesn\'t love me',
    'doesn\'t love me anymore','fell out of love','she stopped loving',
    'win her back','win him back','get her back','get him back',
    'want her back','want him back','trying to fix things','work things out',
    'she said i\'m','he said i\'m','she says i\'m','he says i\'m',
    'she thinks i\'m','he thinks i\'m','she called me','he called me',
    'i hurt her','i hurt him','i was wrong','i messed up',
    'i made a mistake','i said something wrong','i did something wrong',
    'how do i apologize','how do i make it up','how do i fix this',
    'what do i say to her','what do i say to him',
    'what should i tell her','what should i tell him',
    'should i reach out','should i text her','should i text him',
    'she blocked me','he blocked me','she won\'t talk to me','he won\'t talk to me',
    'give her space','give him space','no contact rule',
    'heartbroken','heart is broken','can\'t stop thinking about her',
    'can\'t stop thinking about him','miss her so much','miss him so much',
    'still love her','still love him','love her but','love him but',
    'she cheated on me','he cheated on me','she was cheating','he was cheating',
    'she betrayed me','he betrayed me','she lied to me','he lied to me',
    'reconcile','reconciliation','patch things up','save the relationship',
    'second chance','she gave up on me','he gave up on me',
    'she said she needs space','he said he needs space',
    'she is distancing','he is distancing','she is pulling away','he is pulling away'
  ]
};

const PROMPTS = {

  // ────────────────────────────────────────────────────────────────
  // DEPRESSION
  // Based on: WHO IPT-G (Zambia/StrongMinds), CBT, DSM-5-TR
  // ────────────────────────────────────────────────────────────────
  depression: {
    opening: [
      "It sounds like things have been really heavy for you lately. Can you tell me a bit about what your days have been feeling like recently?",
      "Sometimes depression can feel like a thick fog that never lifts. What does it feel like for you right now, in your own words?",
      "You reached out today and that took courage. What made you decide to talk about this now?",
      "In Zambia, many people carry their pain quietly because of stigma. You don't have to do that here. What has been on your mind?",
      "Can you walk me through what a typical day looks like for you right now — from morning to night?",
      "When did you last feel like yourself — genuinely okay — and what was different then?",
      "Depression often hides behind other things like tiredness or irritability. What have you been noticing about yourself lately?",
      "There is no shame in feeling this way. Many people in our communities suffer in silence. I am here. Where would you like to start?",
      "How long have you been carrying this feeling, and has anyone around you noticed the change in you?",
      "Sometimes the hardest part is naming it. Do you feel like what you are experiencing might be depression, or are you not sure yet?"
    ],
    understanding: [
      "When you say you feel empty, what does that emptiness look like for you — is it numbness, sadness, or something harder to describe?",
      "How has this been affecting your relationships — with family, friends, or at work?",
      "Are there moments in the day that feel slightly better, or does the heaviness stay constant?",
      "Have you lost interest in things that used to bring you joy — food, church, being with people you love?",
      "Depression often affects sleep and appetite. Have you noticed any changes in how you sleep or eat?",
      "Do you find it hard to get out of bed in the morning — not from tiredness but from something deeper?",
      "Has anyone in your family or close circle noticed a change in you, and how has that felt?",
      "Are there any thoughts about not wanting to be here, or feeling like a burden to people around you?",
      "How long have you been managing this alone before deciding to talk about it?",
      "Depression in our communities is sometimes called 'thinking too much.' Has anyone around you dismissed what you are going through in that way?"
    ],
    validation: [
      "What you are feeling is real. Depression is not weakness, laziness, or lack of faith — and it is not your fault.",
      "You have been carrying something very heavy, and I want you to know that reaching out was one of the bravest things you could do.",
      "It makes complete sense that you feel this way given everything you have been through. Your feelings are valid.",
      "Many people in Zambia and across Africa struggle with depression in silence because of stigma. You are not alone and you are not broken.",
      "The exhaustion you feel is not laziness. Depression drains your energy in a way that rest cannot fix — and that is not your fault.",
      "You do not have to pretend to be okay here. Everything you share with me is safe.",
      "Some days just surviving is enough. The fact that you are still here and still trying says a lot about your strength.",
      "Your worth is not tied to your productivity or how well you are coping right now. You matter simply because you are you.",
      "Feeling this way does not mean you are weak or that something is permanently wrong with you. It means you are human.",
      "I hear you. What you are going through is genuinely hard, and your pain deserves to be taken seriously."
    ],
    solutions: [
      "One small step that has helped many people is doing one small enjoyable thing each day, even when motivation is zero. What is one thing you used to enjoy that you could try today — even for five minutes?",
      "Sometimes it helps to notice when thoughts are trapping you. When your mind says 'things will never get better' — try asking yourself: has something ever surprised me before? What was that like?",
      "Building even a small routine can help — a set wake time, one meal, one short walk. It gives the day a shape when everything feels formless. What is one small thing you could anchor your day to?",
      "Physical movement, even a 15-minute walk, genuinely helps lift mood over time. Is there a safe space near you where you could try this a few times this week?",
      "Connecting with one trusted person and being honest about how you feel — even just once — can take enormous weight off. Is there one person who might understand?",
      "Writing down your thoughts — even just three sentences — can help you see what you are carrying instead of it just circling in your head. Would you want to try that in Serene's journal?",
      "Sometimes depression needs support beyond what I can offer. A counsellor or doctor can help significantly. Would you be open to exploring what that looks like in your area?",
      "One thing that has helped others is identifying one person, value, or purpose that still matters to them — and connecting back to it even in a small way. What still matters to you, even a little?"
    ]
  },

  // ────────────────────────────────────────────────────────────────
  // GRIEF
  // Based on: DSM-5-TR Prolonged Grief Disorder, CGT, CBT,
  // African bereavement customs, WHO IPT recommendations
  // ────────────────────────────────────────────────────────────────
  grief: {
    opening: [
      "I am so sorry for your loss. There are no right words, but I want you to know I am here with you in this. Can you tell me about the person you lost?",
      "Losing someone changes everything — the world just looks different. How are you holding up right now?",
      "Grief does not follow any rules or timeline. Whatever you are feeling right now is allowed. What has it been like for you?",
      "In our communities, grief is often carried quietly or rushed through because of expectations. You do not have to do that here. What is sitting heaviest on you right now?",
      "Tell me about who you lost. I want to understand what this person meant to you.",
      "How recent is this loss — are you in the very beginning of this, or has it been some time?",
      "Sometimes grief is mixed with other feelings — guilt, anger, even relief — and that can be confusing. What are you feeling most right now?",
      "Grief hits differently at different times. What has been the hardest part for you so far?",
      "You do not have to be strong right now. What is coming up for you?",
      "I am here, and I am not in a hurry. Take whatever time you need. What would you like to share?"
    ],
    understanding: [
      "What do you miss most about them?",
      "How has life changed in the practical day-to-day since they passed?",
      "Do you have people around you who are also grieving, or are you carrying this mostly alone?",
      "Are you able to sleep and eat, or has the grief been affecting your body as well?",
      "Have there been moments where you forgot for a second — and then it hit you again? What is that like?",
      "Are there things you wish you had said to them, or things left unfinished between you?",
      "How are the people around you — family, community — handling the loss? Is their grief helping you or making it harder?",
      "In our cultural traditions, there are often specific mourning rituals and expectations. Has any of that been helpful, or has it felt like pressure?",
      "Are there moments in the day when the grief is more manageable, or does it feel constant?",
      "Has this loss brought up other losses from the past — old grief that maybe did not get enough space at the time?"
    ],
    validation: [
      "Grief is love with nowhere to go. The depth of what you are feeling reflects the depth of your connection to them.",
      "There is no timeline for grief. Anyone who tells you that you should be 'over it' by now does not understand what you have lost.",
      "In many of our communities, grief is rushed because life keeps moving. But your loss is real, and it deserves to be honored properly.",
      "The pain you feel is a testament to how much that person mattered. That is not weakness — that is love.",
      "Grief affects the body — the exhaustion, the ache, the inability to focus. What you are experiencing physically is a real part of loss.",
      "It is okay to be angry. Grief and anger often live together, and both of them are valid.",
      "You are not 'taking too long.' There is no right speed for this.",
      "Missing someone does not mean you are stuck. It means you loved them, and that does not just disappear.",
      "Whatever complicated feelings you have — guilt, relief, anger — those are all part of grief and none of them make you a bad person.",
      "You carry them with you. That love does not end."
    ],
    solutions: [
      "Sometimes it helps to give yourself a specific time each day to just sit with the grief — to remember, to cry, to feel it fully — rather than trying to fight it all day. Would something like that feel possible for you?",
      "Talking about them — telling stories, sharing memories — is one of the most healing things you can do. Is there someone in your life you could do that with?",
      "Writing a letter to the person you lost — saying things you never got to say — can be a powerful way to process unfinished feelings. You do not have to share it with anyone.",
      "In many Zambian traditions, grief is communal — it is meant to be shared, not carried alone. Who in your community could you lean on right now?",
      "Creating a small ritual in their memory — lighting a candle, visiting somewhere they loved, keeping something of theirs nearby — can help honor the loss without trying to move past it too fast.",
      "If the grief is making it hard to function — eating, sleeping, working — that is a sign that some additional support might help. Speaking to a counsellor who understands grief can make a real difference.",
      "Grief tends to come in waves. When a wave hits, instead of fighting it, try naming it: 'This is grief, and it is allowed.' See if that changes anything.",
      "Sometimes what helps most is simply being with others who have experienced similar loss. Is there a church group, community, or support space where you might find that?"
    ]
  },

  // ────────────────────────────────────────────────────────────────
  // RELATIONSHIPS
  // Based on: Gottman Method, EFT, IPT, CBT,
  // Zambian/African cultural relationship dynamics
  // ────────────────────────────────────────────────────────────────
  relationships: {
    opening: [
      "Relationships can be one of our greatest sources of joy and also our deepest sources of pain. What is happening in yours right now?",
      "It takes courage to talk about relationship struggles — especially in our culture where these things are often kept private. What brought you here today?",
      "Are you going through something with a partner, a family member, or someone else close to you? Tell me what has been happening.",
      "Sometimes the people we love the most are the ones who hurt us the most. Is there someone specific on your mind right now?",
      "In many Zambian households, relationship problems are supposed to stay inside — but that silence can be very heavy. What would you like to share?",
      "Relationships change us — they shape how we see ourselves. What is your relationship making you feel about yourself right now?",
      "Are you looking to understand your relationship better, repair something broken, or find the strength to make a difficult decision?",
      "You don't have to have all the answers right now. Sometimes just talking through what is happening can bring clarity. What is on your mind?",
      "Whether it is a marriage, a partnership, a friendship, or a family relationship — all of these matter. Which one do you want to talk about?",
      "Relationship pain is real pain. What you are going through deserves to be taken seriously. Can you tell me more?"
    ],
    understanding: [
      "When did you first start noticing that something was not right in this relationship?",
      "What does a typical conflict look like between you two — how does it usually start, and how does it end?",
      "Do you feel heard and valued in this relationship, or do you often feel invisible or dismissed?",
      "How has this relationship been affecting other areas of your life — your work, your sleep, your sense of self?",
      "Are there patterns that repeat — the same arguments, the same feelings — that seem impossible to break?",
      "In your culture and family, what were you taught about how relationships should work — and does this relationship match or conflict with that?",
      "Is there trust in this relationship, or has something happened that has broken it?",
      "How does the other person respond when you try to talk about your feelings or concerns?",
      "Do you feel safe in this relationship — emotionally, and physically?",
      "What would this relationship need to look like for you to feel genuinely happy in it?"
    ],
    validation: [
      "Wanting to be heard, respected, and loved in a relationship is not too much to ask. These are basic human needs.",
      "Feeling lonely inside a relationship — sometimes even a marriage — is one of the most painful forms of loneliness there is. Your pain is valid.",
      "In many of our communities, women especially are taught to stay and endure. But enduring is not the same as thriving, and you deserve to thrive.",
      "The confusion you feel — loving someone and also being hurt by them — is one of the most complex human experiences. It makes complete sense.",
      "It is not your fault if communication in your relationship feels impossible. Most people were never taught how to communicate in healthy ways.",
      "You are not being difficult by wanting more from your relationship. You are being honest about your needs.",
      "Whatever has happened in this relationship — the hurt, the disappointment, the distance — your feelings about it are real and they matter.",
      "Staying in a difficult relationship out of love, duty, or fear of what people will say is something many people in our communities experience. You are not alone in this.",
      "It is okay not to have this figured out. Relationships are complicated, and taking time to understand what you need is wise.",
      "The fact that you are trying to understand and improve your relationship shows how much you care. That matters."
    ],
    solutions: [
      "Instead of 'you never listen,' try 'I feel unheard when our conversations get cut short.' It changes the conversation from a blame to a feeling — which is much easier for the other person to hear. Would you be willing to try that approach?",
      "Most relationship conflict is really about one person feeling unseen or unimportant. Underneath the argument, what is the deeper fear you have about this relationship?",
      "One small positive thing — a kind word, a small gesture — done consistently can shift the feel of a relationship over time. What is one small thing you could try this week?",
      "Setting a boundary is not about punishing the other person — it is about protecting your own wellbeing. Is there one boundary you have been needing to set but haven't? What has stopped you?",
      "In many Zambian communities, a trusted elder or family member can help mediate. Is there someone both of you respect who could support a difficult conversation?",
      "Sometimes the most important relationship work is individual — understanding your own patterns. What do you notice about yourself across difficult relationships?",
      "If this relationship involves any form of control, fear, or abuse — safety comes first, before everything else. Would you be open to talking more about what safety looks like for you?"
    ]
  },

  // ────────────────────────────────────────────────────────────────
  // ANXIETY
  // Based on: WHO MhGAP, CBT (Beck), ACT, exposure principles,
  // Zambia mental health context
  //
  // PHILOSOPHY: Anxiety is exhausting. Users need to feel understood
  // first. No breathing exercise lists. No psychoeducation lectures.
  // One practical thing at a time.
  // ────────────────────────────────────────────────────────────────
  anxiety: {
    opening: [
      "That sounds exhausting — when your mind keeps running through every possibility, it can feel impossible to get any rest. What has been worrying you most lately?",
      "Living with constant worry is genuinely tiring. What has been on your mind the most?",
      "When anxiety takes hold it can feel like your brain just won't switch off. How long has it been feeling this way for you?",
      "That kind of relentless worry takes a real toll. What has been triggering it most recently?",
      "Anxiety often shows up in the body too — racing heart, tight chest, that feeling of dread. Is that what it has been like for you?",
      "When you say you can't stop worrying, what kinds of things are your thoughts going to — is it one specific thing, or does your mind jump between many things?",
      "That sounds really overwhelming. Has this been building for a while, or did something specific set it off recently?",
      "Feeling on edge all the time is exhausting in a way that's hard to explain to people who haven't experienced it. What has your anxiety been focused on?",
      "Anxiety can make everything feel urgent and dangerous, even when things are okay. What has it been stealing from you lately — sleep, focus, peace?",
      "I hear you. That feeling of your mind not giving you any peace is one of the hardest things to live with. What is at the center of your worry right now?"
    ],
    understanding: [
      "Is this worry mostly about one specific thing — like your health, money, relationships — or does it shift between different things?",
      "When the anxiety is at its worst, what does it feel like in your body?",
      "Does the worry feel like it has any logic to it, or does it spiral even when you know things are probably okay?",
      "How is the anxiety affecting your sleep? Are you lying awake with your thoughts?",
      "Are there certain times of day when it gets worse — like at night, or in the morning before the day starts?",
      "Have you been avoiding anything because of the anxiety — places, conversations, situations?",
      "When you try to push the worry away, does it come back stronger, or does it ease off?",
      "Have you experienced moments of panic — your heart racing, difficulty breathing, feeling like something is very wrong?",
      "Has anxiety been part of your life for a long time, or is this a more recent thing?",
      "How much is the anxiety affecting your daily life — work, relationships, doing normal things?"
    ],
    validation: [
      "Anxiety is not weakness. Your nervous system is working overtime trying to protect you, and that is exhausting.",
      "What you are going through is real. The fear feels real, the physical sensations are real — even when the threat is not as immediate as it feels.",
      "Living with constant worry is not a character flaw. It is something that happens to a lot of people, and it deserves real attention.",
      "Anxiety can make you feel like you are overreacting — but your experience is valid. What you are feeling is not 'nothing.'",
      "The fact that your mind keeps preparing for the worst does not mean the worst is coming. It means your brain is trying very hard to keep you safe, even when it doesn't need to.",
      "Carrying this kind of mental weight every day takes real courage. The fact that you are still showing up is something.",
      "You are not being dramatic. Anxiety is genuinely distressing and it genuinely interferes with life.",
      "Many people in Zambia carry anxiety quietly — not wanting to seem weak or faithless. But what you are experiencing is real and it is treatable.",
      "It is okay that you can't just 'think positive' and have it go away. Anxiety does not work like that, and you are not failing by still feeling it.",
      "You deserve some relief from this. Not just coping — actual relief. That is possible."
    ],
    solutions: [
      "One thing that sometimes helps with anxious thinking is to ask yourself: does this worry need action right now, or is my mind trying to solve something that isn't actually in front of me yet? That one question can create a small pause.",
      "Anxiety often grows when we keep trying to push it away. Sometimes naming it out loud — even just saying 'this is anxiety' — takes a small amount of its power away. Has anything like that ever helped you?",
      "When the physical anxiety hits — racing heart, tight chest — slow breathing can help calm the body down. Breathe in for 4 counts, hold for 4, out for 6. The longer exhale is what signals safety to your nervous system.",
      "Avoiding things because of anxiety tends to make the anxiety stronger over time — the avoidance becomes its own trap. Is there something small you have been avoiding that you could try facing in a very small way?",
      "Writing down your worries — not to solve them, just to get them out of your head — can reduce the mental load. Even a few sentences. Would you want to try that?",
      "Anxiety is very responsive to routine and structure. A consistent wake time, some movement, and a small calming ritual before bed can reduce baseline anxiety over time. What part of your routine feels most chaotic right now?",
      "If the anxiety is significantly affecting your daily life, speaking to a counsellor who specialises in this can make a real difference. CBT in particular has strong evidence for anxiety. Would you be open to exploring that option?",
      "Sometimes anxiety is telling us something real — that there is a genuine problem that needs attention. Is there something in your life right now that you feel you have been avoiding dealing with?"
    ]
  },

  // ────────────────────────────────────────────────────────────────
  // TRAUMA
  // Based on: Trauma-informed care principles, EMDR concepts,
  // CPT (Cognitive Processing Therapy), WHO guidelines,
  // Zambia / Southern Africa cultural context
  //
  // PHILOSOPHY: Never push. Never probe for trauma details.
  // Safety and control belong to the user at all times.
  // Validate the experience. Normalize the response. Ground in present.
  // ────────────────────────────────────────────────────────────────
  trauma: {
    opening: [
      "That sounds incredibly difficult to carry around with you. You do not have to go into detail — just tell me as much or as little as feels okay right now.",
      "Something happened to you, and it sounds like it is still with you. I am not going to ask you to relive it — just tell me what you need right now.",
      "Carrying something like that takes enormous strength, whether it feels that way or not. How long have you been living with this?",
      "You are safe here. You do not have to explain everything — just start wherever feels right.",
      "What happened to you matters, and what you are feeling because of it matters. What has been hardest about carrying this?",
      "It takes courage to even acknowledge something traumatic. What is making it feel present for you right now?",
      "I hear you. Something happened, and it left a mark. What does that feel like for you day to day?",
      "You do not have to go through everything. What is the part that is affecting you most right now?",
      "Trauma has a way of staying with us even when we want to move on. What has been hardest to shake?",
      "I am here, and there is no judgment here. Take this at whatever pace feels okay for you."
    ],
    understanding: [
      "You don't have to describe what happened — but can you tell me how it is showing up in your life right now?",
      "Are there things that trigger it — sounds, places, conversations — that bring it back suddenly?",
      "How is your sleep? Nightmares or difficulty sleeping are very common after something traumatic.",
      "Do you find yourself going numb sometimes, or feeling disconnected from things around you?",
      "Are there people in your life who know what happened, or have you been carrying this mostly alone?",
      "Has this affected how you feel in your own body — feeling unsafe, on edge, tense?",
      "Do you find yourself avoiding certain places, people, or situations because of what happened?",
      "Has this affected how you see yourself — your sense of who you are or what you deserve?",
      "Is there guilt or shame mixed in with what happened? That is incredibly common, and I want you to know it is not your fault.",
      "How long ago did this happen, and has anything changed in how you experience it over time?"
    ],
    validation: [
      "What happened to you was not okay, and what you are feeling because of it makes complete sense.",
      "Trauma responses are your mind and body doing what they are supposed to do — trying to protect you. You are not broken.",
      "The fact that you are still affected by this does not mean you are weak. It means something serious happened to you.",
      "There is no 'getting over it' on a schedule. Trauma takes as long as it takes, and you do not owe anyone a faster recovery.",
      "Whatever you felt during or after what happened — fear, freeze, confusion — those were normal responses to an abnormal situation.",
      "Carrying this alone takes real strength, even if it does not feel that way.",
      "It was not your fault. Whatever the circumstances, whatever was said to you — it was not your fault.",
      "The intrusive thoughts, the triggers, the way it keeps coming back — this is how trauma works. It does not mean you are stuck forever.",
      "In Zambia and across our region, many people who have experienced trauma have nowhere to talk about it. The silence makes it heavier. You were right to speak.",
      "You survived something. That matters, even when it does not feel like enough."
    ],
    solutions: [
      "Many people try to force traumatic memories away — but that often makes them push back harder. One approach that helps is to focus on where you are right now rather than fighting the memory. When it comes, try reminding yourself: that was then, this is now. What does 'now' look like for you?",
      "Grounding can help when the trauma feels very present. Name five things you can see right now. Four you can touch. Three you can hear. It pulls the brain back into the present moment.",
      "Trauma often settles in the body — tension, pain, numbness. Gentle movement, even just stretching or a slow walk, can help the body begin to feel safe again. Is movement something that might feel accessible for you?",
      "Writing about what happened — not to relive it, but to process it from a safe distance — has helped many people. Even writing what you are feeling right now, not the event itself, can release some of what you are carrying.",
      "You do not have to process this alone. A trauma-informed counsellor — someone specifically trained in this — can make a profound difference. This is one area where professional support is genuinely important. Would you be open to exploring that?",
      "Sometimes what trauma steals most is your sense of safety. Rebuilding that comes from small moments — small choices that remind you that you have some control. What is one area of your life right now where you do feel in control?",
      "Talking to someone you trust — not necessarily about all the details, but about the fact that you are struggling — can reduce the isolation that trauma creates. Is there one person who feels safe enough for that?",
      "Healing from trauma is not linear. There will be better days and harder days. What matters is not moving fast but moving gently and consistently. What is one small thing that helps you feel even slightly safer or more grounded?"
    ]
  },

  // ────────────────────────────────────────────────────────────────
  // POSTPARTUM MENTAL HEALTH
  // Based on: WHO perinatal mental health guidelines,
  // Edinburgh Postnatal Depression Scale principles,
  // CBT for perinatal mental health, Zambia/Africa context
  //
  // PHILOSOPHY: New mothers face enormous pressure to perform happiness.
  // They need permission to feel what they actually feel — without shame.
  // Never jump to solutions before the feeling is validated.
  // ────────────────────────────────────────────────────────────────
  postpartum: {
    opening: [
      "That sounds really lonely — especially when everyone around you expects you to be happy. What has been feeling most different about yourself lately?",
      "Having a baby changes everything, including how you feel about yourself. What has been hardest since the birth?",
      "You don't have to pretend things are okay here. A lot of new mothers feel things they are afraid to say out loud. What is going on for you?",
      "The pressure to be happy after having a baby can be enormous. But you are allowed to feel however you actually feel. What has it really been like?",
      "What you are feeling is allowed, even if it does not match what people expected. What has been most overwhelming?",
      "It sounds like something shifted inside you after the birth. Can you tell me more about what that has been like?",
      "New motherhood is not always what it looks like from the outside. What has yours been like, honestly?",
      "You reached out, and that takes courage — especially when there is so much pressure to just cope. What is sitting heaviest on you right now?",
      "It sounds like you are carrying a lot that you have not been able to say to anyone. I am here. What is going on?",
      "Having a baby is supposed to be one thing, and sometimes it is something else entirely. What has it been like for you?"
    ],
    understanding: [
      "How long after the birth did you start feeling this way?",
      "Are you able to sleep when the baby sleeps, or does something keep you from resting even when you have the chance?",
      "How do you feel when you are with your baby — is there connection there, or does it feel distant or difficult?",
      "Have you been able to tell anyone around you — your partner, your mother, a friend — that you are struggling?",
      "Are you eating and caring for yourself at all, or has that completely fallen away?",
      "Are there moments when you feel like yourself, or does it feel like that person is completely gone right now?",
      "Do you have support around you — people helping with the baby, with the house — or are you carrying most of this alone?",
      "Have you had thoughts of harming yourself or the baby? I am asking not to alarm you but because it is important and you deserve support if that is happening.",
      "In your family or community, is there pressure to appear to be coping even when you are not?",
      "What does a typical day look like for you right now — from the moment you wake up?"
    ],
    validation: [
      "What you are feeling does not make you a bad mother. It makes you a human being who is going through something really hard.",
      "Many new mothers feel exactly what you are describing and feel completely alone with it because nobody talks about this part.",
      "The pressure to be happy and grateful after having a baby is real — and it can make you feel like there is something wrong with you when you do not feel that way. There is nothing wrong with you.",
      "You do not have to be bonded, glowing, and in love with every moment to be a good mother. You just have to keep showing up — and you are doing that.",
      "Postpartum emotional struggle is one of the most common complications of childbirth, and one of the least talked about. You are not alone and you are not failing.",
      "The exhaustion, the disconnection, the loss of yourself — these are real and they deserve real care. Not just 'push through it.'",
      "In many African communities, new mothers are expected to just cope, to be strong, to be grateful. But you are allowed to struggle. You are allowed to need support.",
      "What you are feeling has nothing to do with how much you love your baby. Love and struggle can exist at the same time.",
      "You came here today. That tells me you are trying. That matters more than you know.",
      "Your wellbeing matters — not just for the baby, but for you. You are a person, not just a mother."
    ],
    solutions: [
      "The most important thing right now is telling someone in your life that you are not okay — not performing okay, actually not okay. Is there one person you trust enough to say that to?",
      "Sleep deprivation alone can create feelings that look a lot like depression. Is there anyone — a partner, a family member — who could take the baby for a few hours so you can sleep? Even once?",
      "Sometimes the disconnection from yourself after birth comes partly from the loss of who you were before. What is one small thing from your life before the baby that you miss and might be able to bring back, even in a small way?",
      "Postpartum mental health responds well to support and treatment. A doctor or counsellor can help assess what you are going through and what might help. In Zambia, your nearest health centre can be a starting point — would you feel comfortable exploring that?",
      "Talking to other mothers who have felt what you are feeling — not the ones performing happiness on social media, but real women — can reduce the isolation enormously. Is there a mothers' group, church group, or community where you might find that?",
      "Some days the goal is just the next hour. Not feeling better, not bonding deeply, just getting through the next hour. That is enough for now. What does the next hour look like for you?",
      "If you are having thoughts of harming yourself or your baby, please tell someone in your life today and visit your nearest health centre. You deserve immediate support, and this is something that can be treated."
    ]
  },

  // ────────────────────────────────────────────────────────────────
  // ABUSE & DOMESTIC VIOLENCE
  // Based on: WHO violence against women guidelines,
  // trauma-informed DV principles, safety planning,
  // Zambia GBV resources, coercive control framework
  //
  // PHILOSOPHY: Safety first. Judgment never. No pressure.
  // Never tell someone to leave — that decision is theirs.
  // Never minimize. Never ask 'why don't you just leave.'
  // The priority is: be believed, be safe, be supported.
  // ────────────────────────────────────────────────────────────────
  abuse: {
    opening: [
      "That sounds frightening and exhausting to live with every day. Nobody deserves to feel like they have to constantly monitor their own behavior to avoid conflict. What has been happening?",
      "Living with that kind of control is genuinely frightening, and I want you to know that what you are describing is not normal or okay. Can you tell me more about what things have been like?",
      "I hear you, and I believe you. What you are experiencing matters. What has been happening at home?",
      "You are not overreacting. What you are describing sounds serious, and you were right to say something. What has it been like?",
      "It takes real courage to talk about something like this — especially in our communities where these things are often kept inside. I am glad you are here. What would you like to share?",
      "Your safety matters. What has been going on at home?",
      "That kind of controlling behavior is not love — even when it is dressed up as love. Can you tell me more about what your situation looks like day to day?",
      "You deserve to feel safe in your own home. Something about your situation does not sound safe right now. What has been happening?",
      "I am not going to judge you or tell you what to do. I just want to understand what you are going through. What has it been like?",
      "You reached out, and that matters. What is happening?"
    ],
    understanding: [
      "When you say they control everything — what does that look like day to day? What kinds of things do they monitor or restrict?",
      "Do you feel physically safe, or has there been any physical violence or threats of physical violence?",
      "Are you able to move freely — see your family, friends, go where you need to go — or has that been restricted?",
      "Does this person control money or your access to money?",
      "Are there children in the home, and how is this affecting them?",
      "Is there anyone in your life — family, a friend, a neighbour — who knows what is happening, or have you been isolated from your support system?",
      "Has the situation been getting worse over time, or staying the same?",
      "Do you feel like you can leave if you want to, or does something — fear, finances, children, what people will say — make that feel impossible?",
      "Has your partner threatened you if you were to leave or tell anyone?",
      "How are you coping right now — what has been keeping you going?"
    ],
    validation: [
      "What is happening to you is not okay. You are not overreacting, and you are not to blame.",
      "Control, fear, and isolation in a relationship are forms of abuse — whether or not there is physical violence. What you are experiencing is real.",
      "In many of our communities, women are taught to keep this inside, to protect the family name. But your life and your safety matter more than what people will say.",
      "You have not caused this. The way someone treats you is a reflection of them, not of you.",
      "The confusion you feel — loving this person and also being afraid of them — is one of the most painful and common experiences in abusive relationships. That confusion does not make you foolish.",
      "Leaving is not simple — financially, socially, practically. Anyone who says 'just leave' does not understand what you are facing. I do not expect that from you.",
      "The fact that you are still standing, still caring for yourself and possibly others, in this situation shows real strength.",
      "You deserve to feel safe. Not just physically — emotionally safe, financially safe, free.",
      "You are not alone in this, even if it feels that way. Many women in Zambia face exactly what you are describing, and there is support available.",
      "I believe you. What you are describing is serious and it matters."
    ],
    solutions: [
      "If you are ever in immediate danger, the most important thing is to get somewhere safe. Do you have one person — a neighbour, a family member, anyone — whose home you could go to if you needed to leave quickly?",
      "It helps to have a mental safety plan — knowing ahead of time what you would do, where you would go, what you would take — even if you are not ready to leave now. Would it help to think through what that could look like for you?",
      "In Zambia, the Victim Support Unit (VSU) at any police station provides confidential support to survivors of GBV. You do not have to press charges to access their help. Would you want to know more about that?",
      "There are organisations in Zambia — including YWCA and Women and Law in Southern Africa — that provide confidential support, shelter, and legal advice for women in situations like yours. You do not have to face this alone.",
      "One important thing, if it is safe to do so, is to keep evidence — messages, photos of injuries — in a place your partner cannot access. Do you have a trusted person's phone or a private email account where you could store things?",
      "Your financial independence matters enormously. Is there any way — even small — to start building access to some money of your own, somewhere your partner does not control?",
      "You do not have to decide anything today. But knowing your options — what support exists, what you could access — gives you more power, not less. What would feel most helpful to know right now?",
      "Whatever you decide about your situation, your safety is the priority. If things ever escalate to immediate danger, please contact the police (999 in Zambia) or get to a safe location. Is there someone you trust who knows your situation?"
    ]
  },

  // ────────────────────────────────────────────────────────────────
  // RELATIONSHIP SUPPORT
  // Handles: breakups, betrayal, conflict, communication advice,
  // reconciliation attempts, and emotional processing from any angle —
  // including when the user may have contributed to the relationship pain.
  //
  // PHILOSOPHY: No blame. No judgment. Understand first. Insight second.
  // Meet them in the hurt before moving toward guidance.
  // ────────────────────────────────────────────────────────────────
  relationship_support: {
    opening: [
      "That sounds really painful — whether it came out of nowhere or you saw it coming, hearing someone you care about say that still hurts. What happened?",
      "Relationship pain can feel very isolating — like no one else really understands what you two had. What has been going on between you two?",
      "Breakups and relationship conflicts rarely have one simple cause. You reached out, which means something is weighing on you. What would you like to start with?",
      "It takes honesty to look at a relationship and ask what went wrong — that is not easy. What is on your mind right now?",
      "Whether things ended, are falling apart, or just feel broken right now — that kind of pain is real. What has been happening?",
      "Sometimes the people who hurt us most are the ones we love most. And sometimes we are the one who did the hurting. Either way, it is painful. What is going on?",
      "Relationships are complicated — and so is the grief that comes when they break down. What brought you here today?",
      "It sounds like something significant has happened between you and someone you care about. I am here to listen without judgment. What would you like to share?",
      "There is no shame in struggling in a relationship — or in wanting to do better. What is happening for you right now?",
      "I hear you. Something between you and this person has shifted, or broken, or feels very uncertain right now. Tell me what has been going on."
    ],
    understanding: [
      "What do you think led to this point — was it one thing, or has it been building for a while?",
      "When she said that, what was your first reaction — hurt, anger, guilt, or something harder to name?",
      "Is this a relationship you want to repair, or are you trying to understand what happened so you can move on?",
      "What has the communication been like between you two before this — were you able to talk openly, or has that always been hard?",
      "Do you feel like you understand why she said that, or does it feel confusing or unfair?",
      "What do you think she needs from you right now — space, a conversation, a change, or something else?",
      "Have there been other moments like this — where she has brought up the same concern before?",
      "How are you doing in all of this — not just the situation, but you, inside?",
      "What is the part of this that is hurting you the most right now?",
      "What would a good outcome look like to you — reconciliation, closure, understanding, or something else?"
    ],
    validation: [
      "Hearing someone you love say they don't feel loved anymore is one of the most painful things a person can experience. Your pain makes complete sense.",
      "It is not weakness to want to fix things. The fact that you care enough to ask what to do shows something real.",
      "Relationships are two people — neither person is entirely the reason things go wrong, and neither person is entirely the solution.",
      "Being told you have a pattern — like being too controlling, or too distant, or too anything — can feel like an attack. But it can also be a door. It depends what you do with it.",
      "The fact that you are asking 'what should I do' instead of dismissing what she said suggests you care about her, and about being better. That matters.",
      "Grief after a breakup is real grief — even if the relationship was complicated, even if you were partly at fault. You are allowed to feel the loss.",
      "Wanting someone back does not mean you were right about everything. You can love someone and also have things to work on. Both are true at the same time.",
      "Nobody is taught how to communicate in relationships. Most people learn through pain. What you are going through is hard, and it is also a chance to understand yourself better.",
      "There is no shame in realising you have been doing something in a relationship that was not working. Recognising it is the harder step — most people never get there.",
      "Whatever happened between you two, you deserve support through this. Heartbreak does not come with instructions."
    ],
    solutions: [
      "Before reaching out to her, it helps to get clear on what you actually want to say — not just to win her back, but to genuinely acknowledge what she told you. What is one thing she said that you think might be true?",
      "If she said you were too controlling, the most powerful thing you can say is not a defence — it is 'I hear you, and I want to understand what that looked like for you.' That opens the door instead of closing it.",
      "Giving someone space after a difficult moment is not giving up — it shows you are taking their feelings seriously. What does space look like in your situation — days, weeks?",
      "Changing a pattern in yourself — like being too controlling, or too distant — is real work. It is not something you can promise overnight. But being honest about that is more trustworthy than a quick fix.",
      "If you want to reach out, consider a message that is short, warm, and has no pressure in it. Not 'we need to talk' — but something like 'I have been thinking about what you said and I want you to know I am taking it seriously.'",
      "Sometimes the most important work after a breakup or conflict is individual — understanding what you bring to relationships, what you repeat, and what you want to change. Would that kind of self-reflection feel useful right now?",
      "Whether this relationship is repairable depends on both people. The only part you can control is your own growth and honesty. What is one concrete thing you could do — not to get her back, but to actually be different?",
      "In Zambia, community and family often play a role in helping couples through difficulty. Is there a trusted person — a family member, elder, or pastor — who knows you both and could support a real conversation?"
    ]
  }

};

// ── TOPIC DETECTION ───────────────────────────────────────────────────────
function detectTopic(message) {
  const lower = message.toLowerCase();
  // relationship_support checked before abuse — relationship conflict keywords
  // (breakup, "she said I'm", reconciliation) must not be intercepted by the
  // bare abuse keyword list. abuse keywords are now all victim-centric phrases.
  const priority = [
    'postpartum', 'relationship_support', 'abuse', 'trauma',
    'anxiety', 'grief', 'relationships', 'depression'
  ];
  for (const topic of priority) {
    const keywords = TOPIC_KEYWORDS[topic];
    if (keywords && keywords.some(kw => lower.includes(kw))) return topic;
  }
  return null;
}

// ── THERAPY CONTEXT INJECTION ─────────────────────────────────────────────
// Injects background knowledge into the system prompt.
// The LLM uses this as understanding, never quotes it directly.
function getTherapyContext(message, conversationHistory) {
  let topic = detectTopic(message);

  // If the current message alone doesn't establish a topic, scan recent user
  // messages from history to maintain conversational continuity.
  // This prevents a new message mid-conversation from losing the topic context
  // that was already established (e.g. message 1 says "girlfriend" → relationships,
  // message 2 says "she said I'm too controlling" → would otherwise mis-detect).
  if (!topic && Array.isArray(conversationHistory) && conversationHistory.length >= 2) {
    const recentText = conversationHistory
      .filter(m => m.role === 'user')
      .slice(-4)
      .map(m => m.content || '')
      .join(' ');
    topic = detectTopic(recentText);
  }

  if (!topic || !PROMPTS[topic]) return '';

  const msgCount = Array.isArray(conversationHistory) ? conversationHistory.length : 0;

  let type;
  if      (msgCount <= 2)  type = 'opening';
  else if (msgCount <= 6)  type = 'understanding';
  else if (msgCount <= 10) type = 'validation';
  else                     type = 'solutions';

  const list     = PROMPTS[topic][type];
  const selected = list[Math.floor(Math.random() * list.length)];

  return `\n\nINTERNAL KNOWLEDGE [do not quote or reference this directly]:
Topic detected: ${topic}. Principle to draw from: "${selected}"
Use this only as background understanding to inform your response.
Do NOT copy this text verbatim. Do NOT say "according to..." or "research shows..." or "studies suggest..."
Do NOT sound like a textbook or a psychology article.
Reconstruct naturally: sound like a thoughtful, warm person who deeply understands this situation.
The user must feel understood — not educated.\n`;
}

module.exports = { getTherapyContext, detectTopic, PROMPTS };
