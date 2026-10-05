/*
 * La Tettoia – Speisekarte
 * Source: official menu PDF (Menükarte, Waldstraße 55).
 * Each item: [nr, name, description DE, description EN, price, tags, allergens]
 * tags: v = vegetarisch, s = pikant, f = Fisch & Meeresfrüchte, h = Empfehlung des Hauses
 * Allergen letters / additive numbers as printed on the menu.
 */
window.MENU = {
  food: [
    {
      id: "antipasti", it: "Antipasti", de: "Vorspeisen", en: "Starters",
      items: [
        ["2", "Pane all'aglio", "Knoblauchbrot", "Garlic bread", "4,50", "v", "a"],
        ["3", "Prosciutto di Parma", "Parmaschinken", "Parma ham", "12,90", "", "g"],
        ["4", "Antipasto alla Contadina", "Kalte gemischte Vorspeisenplatte – für 1 Person", "Mixed cold antipasti platter – for 1", "13,90", "", ""],
        ["5", "Antipasto alla Contadina", "Kalte gemischte Vorspeisenplatte – für 2 Personen", "Mixed cold antipasti platter – for 2", "22,90", "h", ""],
        ["6", "Carciofini al naturale", "Artischockenherzen natur", "Artichoke hearts", "9,90", "v", ""],
        ["7", "Insalata frutti di mare", "Meeresfrüchtesalat", "Seafood salad", "12,90", "f", "d, n"],
        ["8", "Cocktail di gamberetti", "Shrimps-Cocktail", "Shrimp cocktail", "10,90", "f", "c, d, g, n, 1"],
        ["9", "Carpaccio", "Rinderfilet, hauchdünn", "Wafer-thin beef fillet", "13,90", "h", "g"],
        ["10", "Bresaola", "Luftgetrockneter Rinderschinken auf Rucola", "Air-dried beef on rocket", "14,90", "", "g"]
      ]
    },
    {
      id: "zuppe", it: "Zuppe", de: "Suppen", en: "Soups",
      items: [
        ["21", "Minestrone all'italiana", "Italienische Gemüsesuppe", "Italian vegetable soup", "5,50", "v", "i"],
        ["22", "Crema di pomodori", "Tomatencremesuppe", "Cream of tomato soup", "4,90", "v", ""],
        ["23", "Zuppa di lenticchie", "Linsensuppe", "Lentil soup", "4,90", "v", "i"]
      ]
    },
    {
      id: "insalate", it: "Insalate", de: "Salate", en: "Salads",
      note: {
        de: "Alle Salate nach Wahl mit Balsamico & Olivenöl, Senf-Honig oder hausgemachtem Joghurtdressing.",
        en: "All salads with your choice of balsamic & olive oil, honey mustard or our homemade yoghurt dressing."
      },
      items: [
        ["31", "Insalata di pomodori", "Tomatensalat mit Zwiebeln", "Tomato & onion salad", "4,90", "v", ""],
        ["32", "Insalata mista", "Gemischter Salat", "Mixed salad", "7,50", "v", ""],
        ["33", "Insalata mista piccola", "Kleiner gemischter Salat", "Small mixed salad", "5,50", "v", ""],
        ["34", "Insalata pastore", "Gemischter Salat mit Schafskäse und Ei", "Mixed salad with feta and egg", "8,90", "v", "c, g"],
        ["35", "Insalata primavera", "Gemischter Salat mit Mozzarella und Ei", "Mixed salad with mozzarella and egg", "8,90", "v", "c, g"],
        ["36", "Insalata caprese", "Tomaten, Mozzarella und Basilikum", "Tomato, mozzarella and basil", "8,50", "v", "g"],
        ["37", "Insalata Toscana", "Rucolasalat mit Parmesan", "Rocket salad with parmesan", "9,50", "v", "g"],
        ["38", "Insalata con petti di pollo", "Gemischter Salat mit Hähnchenbrust", "Mixed salad with chicken breast", "12,90", "", "g, d"],
        ["39", "Insalata La Tettoia", "Gemischter Salat mit gegrilltem Rindfleisch", "Mixed salad with grilled beef", "15,90", "h", ""],
        ["40", "Insalata Tonno", "Gemischter Salat mit Thunfisch und Ei", "Mixed salad with tuna and egg", "9,90", "f", "c, d"]
      ]
    },
    {
      id: "pasta", it: "Pastasciutta", de: "Nudelgerichte", en: "Pasta",
      items: [
        ["71", "Spaghetti Napoli", "Mit Tomatensauce", "Tomato sauce", "7,90", "v", "a"],
        ["72", "Spaghetti bolognese", "Mit Fleischsauce", "Meat ragù", "10,90", "", "a, i"],
        ["73", "Spaghetti carbonara", "Mit Schinken*, Sahne und Ei", "Ham*, cream and egg", "10,90", "", "a, c, g, 13"],
        ["74", "Spaghetti marinara", "Mit Meeresfrüchten", "Seafood", "14,90", "f", "a, d, n"],
        ["75", "Spaghetti aglio e olio", "Mit Knoblauch und Olivenöl", "Garlic and olive oil", "9,50", "v s", "a"],
        ["76", "Spaghetti al pesto", "Mit frischer Kräutersauce", "Fresh herb pesto", "9,50", "v", "a, h"],
        ["77", "Spaghetti Potenza", "Mit Shrimps, Knoblauch und frischem Rucola", "Shrimps, garlic and fresh rocket", "14,50", "f s h", "a, d, n"],
        ["78", "Tagliatelle ai funghi porcini", "Mit Steinpilzsauce", "Porcini mushroom sauce", "12,90", "v", "a, g"],
        ["79", "Tagliatelle al salmone", "Mit Lachsfiletstücken", "Pieces of salmon fillet", "13,50", "f", "a, d, g"],
        ["80", "Rigatoni all'arrabbiata", "Mit frischen Tomaten, Oliven und Peperoni", "Fresh tomatoes, olives and chilli", "9,90", "v s", "a"],
        ["81", "Tortellini gorgonzola", "Mit Gorgonzolasauce auf Rucola", "Gorgonzola sauce on rocket", "13,50", "v", "a, g"],
        ["82", "Tortellini ai funghi porcini", "Mit Steinpilzsauce", "Porcini mushroom sauce", "13,50", "v", "a, g"],
        ["83", "Rigatoni La Tettoia", "Mit Rinderfilet und Tomaten-Sahne-Sauce", "Beef fillet in a tomato-cream sauce", "15,90", "h", "a, g, i"],
        ["84", "Rigatoni pollo", "Mit Hähnchenstreifen und Champignon-Sahnesauce", "Chicken strips, mushroom cream sauce", "12,90", "", "a, g"],
        ["85", "Rigatoni gorgonzola", "Mit Petersilie in Gorgonzola-Sahnesauce", "Parsley, gorgonzola cream sauce", "12,50", "v", "a, g"],
        ["86", "Spaghetti broccoli", "Mit gebratenen Zwiebeln, Broccoli, Oliven und Sahnesauce", "Fried onions, broccoli, olives and cream", "10,50", "v", "a, g"]
      ]
    },
    {
      id: "lasagne", it: "Lasagne & Risotto", de: "Lasagne & Risotto", en: "Lasagne & Risotto",
      note: {
        de: "Lasagne wird mit Käse überbacken und mit Brot serviert.",
        en: "Lasagne is gratinated with cheese and served with bread."
      },
      items: [
        ["91", "Lasagne pasticciata", "Mit Fleischsauce, mit Käse überbacken", "Meat ragù, gratinated with cheese", "11,50", "", "a, g, i"],
        ["92", "Lasagne vegetale", "Mit Gemüse, mit Käse überbacken", "Vegetables, gratinated with cheese", "11,00", "v", "a, g, i"],
        ["93", "Lasagne La Tettoia", "Mit Lachs, Spinat und Sahnesauce, überbacken", "Salmon, spinach and cream, gratinated", "13,90", "f h", "a, d, g, i"],
        ["51", "Risotto alla pescatora", "Mit Meeresfrüchten", "Seafood", "12,90", "f", "d, n"],
        ["52", "Risotto della casa", "Mit Schinken* und Champignons in Tomatensauce", "Ham* and mushrooms in tomato sauce", "11,50", "", "13"],
        ["53", "Risotto ai porcini", "Mit Steinpilzsauce", "Porcini mushroom sauce", "12,50", "v", "g"]
      ]
    },
    {
      id: "pizza", it: "Pizze", de: "Pizza · 32 cm", en: "Pizza · 32 cm",
      note: {
        de: "Jede Pizza mit Tomatensauce und Mozzarella – frisch aus dem Ofen.",
        en: "Every pizza comes with tomato sauce and mozzarella – fresh from the oven."
      },
      items: [
        ["101", "Margherita", "Tomatensauce und Mozzarella", "Tomato sauce and mozzarella", "7,90", "v", "a, g"],
        ["102", "Napoli", "Sardellen, Kapern und Oliven", "Anchovies, capers and olives", "10,90", "f", "a, g, d, n"],
        ["103", "Funghi", "Frische Champignons", "Fresh mushrooms", "10,90", "v", "a, g"],
        ["104", "Prosciutto", "Schinken*", "Ham*", "10,90", "", "a, g, 13"],
        ["105", "Prosciutto e funghi", "Schinken* und Champignons", "Ham* and mushrooms", "11,50", "", "a, g, 13"],
        ["106", "Salami", "Salami", "Salami", "10,90", "", "a, g"],
        ["107", "Tonno", "Thunfisch und Zwiebeln", "Tuna and onions", "11,50", "f", "a, g, d"],
        ["108", "La Tettoia", "Salami, Schinken*, milde Peperoni, Champignons und Artischocken", "Salami, ham*, mild peppers, mushrooms and artichokes", "11,90", "h", "a, g, 13"],
        ["109", "Quattro stagioni", "Salami, Schinken*, milde Peperoni und Champignons", "Salami, ham*, mild peppers and mushrooms", "11,90", "", "a, g, 13"],
        ["110", "Ischia", "Salami, Schinken* und milde Peperoni", "Salami, ham* and mild peppers", "10,90", "", "a, g, 13"],
        ["111", "Pescatore", "Meeresfrüchte", "Seafood", "14,50", "f", "a, g, d, n"],
        ["112", "Potenza", "Spinat und Gorgonzola", "Spinach and gorgonzola", "12,50", "v", "a, g"],
        ["113", "Scampi", "Garnelen und Shrimps", "King prawns and shrimps", "13,50", "f", "a, g, d, n"],
        ["114", "Taormina", "Salami, Champignons und Artischocken", "Salami, mushrooms and artichokes", "11,50", "", "a, g"],
        ["115", "Hawaii", "Schinken* und Ananas", "Ham* and pineapple", "11,50", "", "a, g, 13"],
        ["116", "Vegetariana", "Artischocken, Champignons, Zwiebeln, Peperoni und Broccoli", "Artichokes, mushrooms, onions, peppers and broccoli", "11,90", "v", "a, g"],
        ["117", "Mozzarella caprese", "Tomatenscheiben, Basilikum und Mozzarellakugeln", "Sliced tomatoes, basil and mozzarella pearls", "11,50", "v", "a, g"],
        ["118", "Pizza del re", "Mozzarella, Rucola und Kirschtomaten", "Mozzarella, rocket and cherry tomatoes", "10,50", "v", "a, g"],
        ["119", "Basilicata", "Parmaschinken, Rucola, Kirschtomaten und Parmigiano", "Parma ham, rocket, cherry tomatoes and parmigiano", "12,90", "h", "a, g"],
        ["120", "Quattro formaggi", "Vier verschiedene Käsesorten", "Four cheeses", "12,90", "v", "a, g"],
        ["121", "Peperoni", "Peperoni", "Peppers", "10,50", "v", "a, g"],
        ["122", "Al salmone", "Lachsstreifen, Spinat und Zwiebeln", "Salmon strips, spinach and onions", "12,90", "f", "a, d, g"],
        ["123", "Piccante", "Scharfe Salami und Champignons", "Spicy salami and mushrooms", "12,90", "s", "a, g"],
        ["124", "Wald", "Tomaten, Oliven, Spinat, Champignons und Zwiebeln", "Tomatoes, olives, spinach, mushrooms and onions", "11,90", "v", "a, g"],
        ["125", "Rashti", "Hackfleisch, Zwiebeln, Champignons und Peperoni", "Minced beef, onions, mushrooms and peppers", "12,90", "", "a, g"],
        ["126", "Pollo", "Hähnchenbrust, Zwiebeln, Tomaten und Oliven", "Chicken breast, onions, tomatoes and olives", "12,90", "", "a, g"],
        ["127", "Spinaci", "Spinat und Mozzarellakugeln", "Spinach and mozzarella pearls", "11,90", "v", "a, g"],
        ["128", "Calzone", "Gefüllt mit Salami, Schinken*, Champignons, Peperoni und Mozzarella", "Folded, filled with salami, ham*, mushrooms, peppers and mozzarella", "12,50", "", "a, g, 13"],
        ["129", "Vegana", "Ohne Käse – Artischocken, Champignons, Zwiebeln, Peperoni und Broccoli", "No cheese – artichokes, mushrooms, onions, peppers and broccoli", "11,50", "v", "a"]
      ]
    },
    {
      id: "carne", it: "Carne", de: "Fleisch", en: "Meat",
      note: {
        de: "Alle Fleischgerichte mit grünen Bohnen und einer Beilage nach Wahl: Pommes frites, Reis oder Rosmarin-Kartoffeln.",
        en: "All meat dishes come with green beans and a side of your choice: fries, rice or rosemary potatoes."
      },
      items: [
        ["131", "Scaloppa milanese", "Schnitzel Wiener Art, paniert", "Breaded escalope, Viennese style", "14,90", "", "a, c"],
        ["132", "Scaloppa caprese", "Schnitzel mit Tomaten und Mozzarella überbacken", "Escalope gratinated with tomato and mozzarella", "16,90", "", "a, c, g"],
        ["133", "Scaloppa funghi", "Medaillons in Champignon-Rahmsauce", "Medallions in mushroom cream sauce", "16,50", "", "a, c, g"],
        ["134", "Scaloppa valdostana", "Schnitzel mit Schinken*, Tomatensauce und Käse überbacken", "Escalope with ham*, tomato sauce and cheese", "16,90", "", "a, c, g, 13"],
        ["135", "Scaloppa hawaii", "Schnitzel mit Schinken*, Ananas und Käse überbacken", "Escalope with ham*, pineapple and cheese", "16,90", "", "a, c, g, 13"],
        ["136", "Scaloppa tivoli", "Schnitzel mit Tomaten, Rucola und Parmesan", "Escalope with tomato, rocket and parmesan", "17,50", "", "a, c, g"],
        ["137", "Scaloppine al gorgonzola", "Medaillons in Gorgonzolasauce", "Medallions in gorgonzola sauce", "17,50", "", "g"],
        ["138", "Scaloppine al vino bianco", "Medaillons in Weißweinsauce", "Medallions in white-wine sauce", "17,50", "", ""],
        ["139", "Saltimbocca alla romana", "Medaillons mit Parmaschinken und Salbei in Weißweinsauce", "Medallions with Parma ham and sage in white wine", "17,90", "h", ""],
        ["140", "Scaloppine su letto di rucola", "Medaillons vom Grill auf Rucolasalat", "Grilled medallions on rocket salad", "17,90", "", ""],
        ["151", "Filetto alla griglia", "Rinderfilet vom Grill", "Grilled beef fillet", "24,50", "h", ""],
        ["152", "Filetto ai funghi", "Rinderfilet mit Champignon-Rahmsauce", "Beef fillet, mushroom cream sauce", "26,50", "", "g"],
        ["153", "Filetto al gorgonzola", "Rinderfilet mit Gorgonzolasauce", "Beef fillet, gorgonzola sauce", "26,50", "", "g"],
        ["154", "Filetto ai cantarelli", "Rinderfilet mit Pfifferling-Rahmsauce", "Beef fillet, chanterelle cream sauce", "26,50", "", "g"],
        ["155", "Filetto al pepe verde", "Rinderfilet in grüner Pfeffersauce", "Beef fillet, green peppercorn sauce", "26,50", "", "g"],
        ["156", "Fegato alla veneziana", "Kalbsleber mit gebratenen Zwiebeln", "Calf's liver with fried onions", "18,50", "", ""]
      ]
    },
    {
      id: "pesce", it: "Pesce", de: "Fisch", en: "Fish",
      note: {
        de: "Alle Fischgerichte mit Salat und Rosmarin-Kartoffeln. Dazu auf Wunsch Knoblauchbrot (+2,50 €) oder gebratenes Gemüse (+3,50 €).",
        en: "All fish dishes come with salad and rosemary potatoes. Add garlic bread (+€2.50) or roasted vegetables (+€3.50)."
      },
      items: [
        ["161", "Scampi al forno", "6 Riesengarnelen in Knoblauchsauce", "6 king prawns in garlic sauce", "22,90", "f", "n"],
        ["162", "Scampi alla griglia", "6 Riesengarnelen mit Schale vom Grill", "6 grilled shell-on king prawns", "22,90", "f h", "n"],
        ["163", "Scampi al pepe verde", "6 Riesengarnelen in grüner Pfeffersauce", "6 king prawns, green peppercorn sauce", "22,90", "f", "g, n"],
        ["164", "Salmone al vino bianco", "Lachsfilet in Weißweinsauce", "Salmon fillet in white-wine sauce", "17,90", "f", "d"],
        ["165", "Salmone al pepe verde", "Lachsfilet in grüner Pfeffersauce", "Salmon fillet, green peppercorn sauce", "17,90", "f", "d, g"],
        ["166", "Salmone alla griglia", "Lachsfilet vom Grill", "Grilled salmon fillet", "17,90", "f", "d"],
        ["167", "Filetto di lucioperca", "Zanderfilet in Weißweinsauce", "Pike-perch fillet in white-wine sauce", "17,50", "f", "d, g"],
        ["168", "Pesce Deluxe · per due", "2 Lachsfilets, 4 Riesengarnelen, Calamari, Kartoffeln, Salat, Brot, Hausdressing & 0,5 l Hauswein – für zwei", "2 salmon fillets, 4 king prawns, calamari, potatoes, salad, bread, house dressing & 0.5 l house wine – for two", "49,90", "f h", "d, n"]
      ]
    },
    {
      id: "formaggi", it: "Formaggi & Contorni", de: "Käse & Beilagen", en: "Cheese & Sides",
      items: [
        ["61", "Gorgonzola", "Italienischer Blauschimmelkäse", "Italian blue cheese", "10,50", "v", "g"],
        ["62", "Grana", "Italienischer Hartkäse", "Italian hard cheese", "10,50", "v", "g"],
        ["63", "Formaggio misto", "Gemischte Käseplatte – für 1 Person", "Mixed cheese platter – for 1", "11,90", "v", "g"],
        ["64", "Formaggio misto", "Gemischte Käseplatte – für 2 Personen", "Mixed cheese platter – for 2", "17,90", "v", "g"],
        ["193", "Riso", "Reis", "Rice", "4,00", "v", ""],
        ["194", "Insalata di contorno", "Gemischter Beilagensalat", "Side salad", "5,00", "v", ""],
        ["195", "Pizzabrot", "Pizzabrot", "Pizza bread", "6,50", "v", "a"],
        ["196", "Patatine", "Pommes frites", "French fries", "4,50", "v", ""]
      ]
    },
    {
      id: "bambini", it: "Bambini", de: "Für unsere kleinen Gäste", en: "For our young guests",
      note: { de: "Ausschließlich für Kinder.", en: "For children only." },
      items: [
        ["182", "Spaghetti Napoli", "Mit Tomatensauce", "Tomato sauce", "6,50", "v", "a"],
        ["183", "Pizza Margherita", "Tomatensauce und Mozzarella", "Tomato sauce and mozzarella", "6,90", "v", "a, g"],
        ["184", "Pizza Salami", "Mit Salami", "Salami", "7,90", "", "a, g"],
        ["185", "Pizza Tonno", "Thunfisch und Zwiebeln", "Tuna and onions", "7,90", "f", "a, g, d"]
      ]
    },
    {
      id: "dolci", it: "Dolci", de: "Desserts", en: "Desserts",
      items: [
        ["201", "Panna cotta", "Italienischer Sahnepudding – hausgemacht", "Italian cream pudding – homemade", "5,00", "v h", "g"],
        ["202", "Tiramisù", "Löffelbiskuit und Mascarponecreme – hausgemacht", "Ladyfingers and mascarpone cream – homemade", "5,50", "v h", "a, c, g"],
        ["203", "Tartufo nero", "Vanilleeis umhüllt von Schokoladeneis, mit Kakao bestäubt", "Vanilla ice cream wrapped in chocolate ice cream, dusted with cocoa", "5,90", "v", "g"],
        ["204", "Gelato misto", "Gemischtes Eis", "Mixed ice cream", "5,50", "v", "g"],
        ["205", "Gelato misto con panna", "Gemischtes Eis mit Schlagsahne", "Mixed ice cream with whipped cream", "5,90", "v", "g"],
        ["206", "Dolce La Tettoia", "Die süße Versuchung – lassen Sie sich überraschen", "The sweet temptation – let us surprise you", "9,50", "v", "g"]
      ]
    }
  ],

  /* Drinks: [name, size, price] or for wines: [nr, name, 0.25 l, 0.5 l, 1 l] */
  drinks: [
    {
      id: "aperitivi", it: "Aperitivi", de: "Aperitifs", en: "Aperitifs",
      items: [
        ["Aperol Spritz", "0,2 l", "7,50"], ["Hugo", "0,2 l", "7,50"], ["Prosecco", "0,1 l", "4,90"],
        ["Prosecco Aperol", "0,2 l", "7,00"], ["Campari Soda", "0,2 l", "7,00"], ["Campari Orange", "0,2 l", "7,00"],
        ["Martini", "5 cl", "6,50"], ["Sherry", "5 cl", "6,50"]
      ]
    },
    {
      id: "vini", it: "Vini", de: "Offene Weine", en: "Wine by the carafe", wine: true,
      groups: [
        { de: "Weißwein", en: "White", items: [
          ["Vino della casa", "5,50", "9,90", "18,70"], ["Chardonnay", "5,50", "9,90", "18,70"], ["Soave", "5,50", "9,90", "18,70"],
          ["Pinot Grigio", "5,50", "9,90", "18,70"], ["Riesling", "5,50", "9,90", "18,70"], ["Weißweinschorle", "4,60", "–", "–"]
        ]},
        { de: "Rotwein & Rosé", en: "Red & Rosé", items: [
          ["Vino della casa", "5,50", "9,50", "18,50"], ["Merlot", "5,50", "9,50", "18,50"], ["Chianti", "5,50", "9,50", "18,50"],
          ["Lambrusco", "5,50", "9,50", "18,50"], ["Shiraz", "5,50", "9,50", "18,50"], ["Rosé", "5,50", "9,50", "18,50"],
          ["Sangria", "–", "11,50", "20,80"]
        ]}
      ]
    },
    {
      id: "birre", it: "Birre", de: "Biere", en: "Beer",
      items: [
        ["Berliner Pilsener vom Fass", "0,3 / 0,4 / 0,5 l", "3,90 / 4,50 / 4,90"],
        ["Jever Pilsener vom Fass", "0,3 / 0,4 / 0,5 l", "3,90 / 4,50 / 4,90"],
        ["Alster", "0,3 / 0,4 / 0,5 l", "3,90 / 4,50 / 4,90"],
        ["Erdinger Kristall · Hefe hell · Hefe dunkel", "0,5 l", "4,90"],
        ["Erdinger alkoholfrei", "0,5 l", "4,80"], ["Jever Fun alkoholfrei", "0,33 l", "4,30"],
        ["Berliner Weisse rot / grün", "0,33 l", "4,50"], ["Malzbier", "0,33 l", "4,50"]
      ]
    },
    {
      id: "analcolici", it: "Analcolici", de: "Alkoholfreie Getränke", en: "Soft drinks",
      items: [
        ["Coca-Cola · Cola Zero · Fanta · Sprite · Spezi", "0,2 / 0,4 l", "3,00 / 4,90"],
        ["Fassbrause", "0,2 / 0,4 l", "3,20 / 4,90"],
        ["Tonic Water · Bitter Lemon · Ginger Ale", "0,2 / 0,4 l", "3,30 / 4,90"],
        ["Bonaqua Tafelwasser", "0,2 / 0,4 l", "2,90 / 4,20"],
        ["San Pellegrino", "0,25 / 0,75 l", "3,50 / 5,90"],
        ["Fruchtsaft (Apfel, Orange, Rhabarber, Mango, Kirsch, Banane)", "0,2 / 0,4 l", "3,50 / 5,50"],
        ["Fruchtsaftschorle", "0,2 / 0,4 l", "3,30 / 5,00"],
        ["KiBa (Kirsch-Banane)", "0,2 / 0,4 l", "3,70 / 5,50"]
      ]
    },
    {
      id: "caffe", it: "Caffetteria", de: "Warme Getränke", en: "Hot drinks",
      items: [
        ["Espresso", "", "2,50"], ["Espresso doppio", "", "3,80"], ["Espresso corretto", "", "4,50"],
        ["Espresso macchiato", "", "3,50"], ["Cappuccino", "", "3,50"], ["Latte macchiato", "", "4,50"],
        ["Milchkaffee", "", "3,70"], ["Tasse Kaffee", "", "2,90"], ["Tee nach Wahl", "Glas", "3,30"],
        ["Tee mit Ingwer oder frischer Minze", "", "3,90"], ["Heiße Schokolade", "", "3,90"]
      ]
    },
    {
      id: "digestivi", it: "Digestivi & Long Drinks", de: "Digestifs & Longdrinks", en: "Digestifs & Long drinks",
      items: [
        ["Grappa · Ramazzotti · Limoncello · Wodka", "2 cl", "4,30"],
        ["Sambuca · Amaretto", "2 cl", "4,20"],
        ["Fernet Branca · Fernet Menta · Averna · Vecchia Romagna · Amaro Lucano", "2 cl", "4,50"],
        ["Jim Beam · Chivas · Gin Tonic · Bacardi Cola", "4 cl", "6,90"],
        ["Wodka Orange · Wodka Lemon", "4 cl", "7,50"]
      ]
    }
  ]
};
