process.env["NTBA_FIX_319"] = 1;
const TelegramBot = require('node-telegram-bot-api');
const request = require('request');
const fs = require('fs');
const axios = require('axios');
require('mongodb')

const hi = [ 'Давно не виделись, ', 'Добро пожаловать, ', 'У вас еще нет сериалов.\n/find название - чтобы найти сериал'];
const texth = {
	find: 'Введи /find и название, чтобы найти сериал. Либо просто отправь название.', 
	clear_series: '/clear_series - очистить статистику просмотров серий.',
	clear_all: '/clear_all - очиcтить все данные. Вернуть их будет нельзя!',
	profile: '/profile - чтобы увидеть список своих сериалов.'
};
const emojirating = [ '\ud83d\ude16', '\u2639\ufe0f', '\ud83d\ude10', '\ud83d\ude42', '\ud83d\ude0a' ];

const emoji = {
	stars: '\u2728',
	star: '\u2b50\ufe0f', 
	check: '\u2705',
	uncheck: '\u2611\ufe0f',
	checkmark: '\u2714\ufe0f',
	ar1: '\u23ee',
	ar2: '\u23ea',
	ar3: '\u25c0\ufe0f',
	ar4: '\u25b6\ufe0f',
	ar5: '\u23e9',
	ar6: '\u23ed'
};
const status = [ 'смотрю', 'буду смотреть', 'заброшен', 'просмотрен' ];	

(async function() {
    try {
    	const admins = [];
		const path = require("path");
		
		var data = JSON.parse(fs.readFileSync('data.json', 'utf8'));

		if (data.token == null) { //токен бота записан в файле data
			showError('Token Not Found');
			return;
		}
		data.admins.forEach(function(a) {
			admins.push(a);
		});

    	const bot = new TelegramBot(data.token, { polling: true });
    	const getDb = require('./db');
        db = await getDb();
		
		startBot();
		
		console.log("Bot started.");

        //команды с текстом и без
		bot.onText(/^(\/[a-zA-Z]+[\w_]*)$|^(\/[a-zA-Z]+[\w_]*) (.+)$/, async function (msg, match) {
			try {
				var id = msg.from.id;
				
				var reg = false;
				var user = await db.collection("Users").findOne({ userId: id });
				if (!user) {	
					showSmth('---- New user: '+msg.from.first_name+' ----', id);		
					db.collection("Users").insertOne( { userId: id, regdate: new Date().toLocaleString(), showed: 0 } );
					user = await db.collection("Users").findOne({ userId: id });
					reg = true;
				}
				switch (match[0]) {
					case '/start':
						if (reg)
							bot.sendMessage(id, hi[1]+msg.from.first_name+'!\n\n'+texth.find+`\n${texth.profile}`);
	  					else
	  						bot.sendMessage(id, hi[0]+msg.from.first_name+'!');
						break;
					case '/profile':
						await showProfile(bot, msg, user, 0);
						break;
					case '/settings':
						var settings = '';
						bot.sendMessage(id, `${settings}\n${texth.clear_series}\n${texth.clear_all}`);
						break;
					case '/find': 
						bot.sendMessage(id, texth.find);
						break;
					case '/notes':

						break;
					case '/clear_series':
						await db.collection("UserSeries").deleteMany({ userId: id });
						bot.sendMessage(id, `Статистика просмотров серий была очищена.`);
						break;
					case '/clear_all':
						await db.collection("UserSerials").deleteMany({ userId: id });
						await db.collection("UserSeries").deleteMany({ userId: id });
						bot.sendMessage(id, `Все данные о ваших сериалах очищены.`);
						break;
					default: break;
				}
				if (!match[3]) //если после команды нет текста
					return;
				switch (match[2]) {
					case '/find':
						await findSerial(bot, msg, id, match[3]);
						break;
					case '/help':
						bot.sendMessage(id, `${profile}\n${find}\n${texth.clear_series}\n${texth.clear_all}`);
						break;
					case '/note':
						if (admins.some(a => a === id ))
						{
							var n = match[3].split('\'');
							db.collection("Notes").insertOne({ userId: id, note: match[3], date: Date().toLocaleString() })
						}
						break;
					case '/notes':
						break;
					default: break;
				}
			}
			catch (e){
				showError('Failed bot.onText(coomand). '+e, id);
			}
		});

		//простой текст поиска
		bot.onText(/^([а-яА-Яa-zA-Z0-9]+[а-яА-Я\w\d\s'".,;_!-]*)$/, async function(msg, match) {
			var id = msg.from.id;
			showSmth(msg.text, id);
			await findSerial(bot, msg, id, match[0]);
		});

		//ответы кнопок
		bot.on('callback_query', async function (msg) {
			var d = msg.data.split('_');
			var id = msg.from.id;
			showSmth(msg.data, id);
			var limit = 25;
			try {
				switch (d[0]){
					case 'menu': //вывод списка сериалов пользователя
						if (d[1] >= 0 && d[1] <= 3)
							await showSerials(bot, msg, id, d[1], 1, limit, 0);
						break;
					case 'toprofile': //вернуться к профилю
						var user = await db.collection("Users").findOne({ userId: id });
						await showProfile(bot, msg, user, 1);
						break;
					case 'serials': //постраничный вывод сериалов пользователя 
						if (d[1] == 0) //переход на другую страницу -- serials_0_topage_type_current
						{
							if (d[2] == d[4])
								return;
							var skip = (+d[2]-1)*limit;
							await showSerials(bot, msg, id, +d[3], +d[2], limit, skip); //showSerials(bot, msg, id, type, current, limit, skip)
						}
						else if (d[1] == 1) //выбран сериал из списка -- serials_1_serialId
							await showSerial(bot, msg, id, +d[2], 1);
						break;
					case 'seasons': //выбрано отображение сезонов
						await showSeasons(bot,msg, id, d[1]);
						break;
					case 'toserial': //вернуться к сериалу
						await showSerial(bot, msg, id, d[1], d[2]);
						break;
					case 'series': //выбрано отображение серий
						limit = 25;
						var skip = (+d[3]-1)*limit;
						if (d[5] == 0 && (d[6] == 0 || d[6] == 1)) //-- series_serialId_season_topage_current_0_(0/1) 
						{
							await checkAllSeries(msg, id, +d[1], d[2], d[6]);
							await showSeries(bot, msg, id, +d[1], d[2], 1, limit,  0);
						}
						else if (d[5] == 1) //-- series_serialId_season_topage_current_1_episode_watched 
						{
							await checkEpisode(msg, id, +d[1], d[2], d[6], d[7]);
							await showSeries(bot,msg, id, +d[1], d[2], d[4], limit,  0, skip);
						}
						else { //-- series_serialId_season_topage_current
							if (d[3] == d[4])
								return;
							await showSeries(bot,msg, id, +d[1], d[2], +d[3], limit,  skip);
						}
						break;
					case 'toseasons': //вернуться к сезонам
						await showSeasons(bot,msg, id, d[1]);
						break;
					case 'serial': //выставлен статус сериалу
						if (d[1] == 'rating') //serial_rating_serialId_num
						{
							if (+d[3] > 5) d[3] = 5;
							if (+d[3] < 1) d[3] = 1;
							var edit = await editUserSerial(id, +d[2], 1, d[3]);
							if (edit === true)
								await showSerial(bot, msg, id, +d[2], 1);
						}
						else //serial_status_serialId_num
						{  
							await editUserSerial(id, +d[2], 0, +d[3]);
							if (+d[3] == 3)
								await checkAllSeries(msg, id, +d[2], 0, '1', 1)
							await showSerial(bot, msg, id, +d[2], 1);
						}
						break;
					default: break;
				}
			}
			catch(e){
  				showError('Failed bot.on(callback_query). '+e, id);

			}
		});

		//ошибки
		bot.on("polling_error", (err) => showError('Failed polling_error. '+e));
    }
    catch(e){
    	showError('Failed main func. '+e);
    }
})()

async function startBot(){
	// await db.collection("Users").drop();
	// await db.collection("UserSerials").drop();
	// await db.collection("UserSeries").drop();
	// await db.collection("Genres").drop();

 	var genres = await getGenres();
 	for (var i = 0; i < genres.length; i++) {
 		db.collection("Genres").insertOne( { genreId: genres[i].id, title: genres[i].title });
 	}
}

async function findSerial(bot, msg, id, find){
	try{
		var serials = await findSerialData(find);
    	await showFindSerials(bot, msg, id, serials);
	}
    catch(e) {
  		showError(e, id);
    }
}

async function checkUserSerial(id, serialId){
	var serial = await db.collection("UserSerials").findOne({ userId: id, serialId: serialId });
	if (serial)
		return;
	var serial = await getSerialData(serialId, false);
	var opt = {userId: id, serialId: serialId, title: serial.title, year: serial.year, status: 0, rating: null };
	await db.collection("UserSerials").insertOne(opt);
}
async function editUserSerial(id, serialId, type, value){
	var serial = await db.collection("UserSerials").findOne({ userId: id, serialId: serialId });
	if (serial) {
		if (type == 0 && serial.status != value)
			db.collection("UserSerials").updateOne( { userId: id, serialId: serialId }, { $set: { status: value }} );
		else if (type == 1 && serial.rating != value)
			db.collection("UserSerials").updateOne( { userId: id, serialId: serialId }, { $set: { rating: value }} );
		else return false;
		return true;
	}
	else {
		var serial = await getSerialData(serialId, false);
		var opt = {userId: id, serialId: serialId, title: serial.title, year: serial.year, status: 0, rating: value };
		if (type != 1) {
			opt.status = value;
			opt.rating = null;
		}
		await db.collection("UserSerials").insertOne(opt);
		return true;
	}
}

//нумерованый текст списка сериалов
function getSerialsListText(serials, startnum, type) {
	var text = '';
	if (type == 0)
		text = 'Смотрю: \n';
	else if (type == 1)
		text = 'Буду смотреть: \n';
	else if (type == 2)
		text = 'Заброшено: \n';
	else if (type == 3)
		text = 'Просмотрено: \n';

	for (var i = 0; i < serials.length; i++) {
		var rating = '';
		if (serials[i].rating)
			rating = ` ${serials[i].rating}${emoji.stars}`;
		text = `${text}*${startnum+i}*. ${serials[i].title} (${serials[i].year})${rating}\n`;
	}
	return text;
}
//нумерованый текст списка поиска сериалов
function getFindSerialsListText(serials) {
	var text = 'Результаты поиска:\n\n';
	if (serials.length == 0)
		return text+'Сериал не найден';
	for (var i = 0; i < serials.length; i++) {
		var title = serials[i].ruTitle;
		if (!title || title == '')
			title = serials[i].title;
		text = `${text}*${i+1}*. ${title} (${serials[i].year})\n`;
	}
	return text;
}

//данные сериала
async function getSerialText(id, serialId) {
	var serial = await getSerialData(serialId, false);
	var title = `*${serial.title}*\n`;
	if (serial.title != serial.titleOriginal)
		title += `_${serial.titleOriginal}_\n`;

  	var text = `[ ](${serial.image})${title}Дата выхода: ${serial.started}`;
  	if (serial.ended != null && serial.ended != '')
  		text = `${text} - ${serial.ended}\n`;
	
  	var genres = '';
	
  	if (serial.genreIds && serial.genreIds.length != 0){
  		genres = '\nЖанры: ';
  		for (var i = 0; i < serial.genreIds.length; i++) {
  			var genre = await db.collection("Genres").findOne({ genreId: serial.genreIds[i] });
  			genres += genre.title;
  			if (i < serial.genreIds.length - 1)
  				genres += ', ';
  		}
  	}
	
  	var desc = '';
  	if (serial.description)
  		desc = 'Описание: ' +  (serial.description.replace(/(&#\d*\;)|(<([^>]+)>)|(\\\w)/ig, '')).replace (/[\n\r]/g, ' ').replace (/\s{2,}/g, ' ');

  	text = `${text}\nРейтинг: ${serial.rating}${emoji.stars}\nСтрана: ${serial.country}\nКанал: ${serial.network.title}${genres}\nСезоны: ${serial.totalSeasons}\n${desc}\n`; 
	
	var serial1 = await db.collection("UserSerials").findOne({ userId: id, serialId: +serialId });
	if (serial1) {
		text += '\n';
		if (serial1.rating)
			text = `${text}Ваша оценка: ${serial1.rating}${emoji.stars}\n`;
		text = 	`${text}Статус: *${status[serial1.status]}*\n`;
	}
	return text;
}

//данные инлайн кнопок для профиля (смотрю, буду смотреть, заброшено, просмотрно)
function getProfileMenu(watch, will, stop, watched) {
  var keys = [];
  if (watch > 0)
  	keys.push( [{text: 'Смотрю: '+watch, callback_data: 'menu_0' } ] );
  if (will > 0)
  	keys.push( [{text: 'Буду смотреть: '+will, callback_data: 'menu_1' } ]);
  if (stop > 0)
  	keys.push( [{text: 'Заброшено: '+stop, callback_data: 'menu_2' }] );
  if (watched > 0)
  	keys.push( [{text: 'Просмотрено: '+watched, callback_data: 'menu_3' }] );
  return {
    reply_markup: JSON.stringify({
      inline_keyboard: keys
    })
  };
}
//инлайн кнопки для перехода по страницам списка сериалов
function getSerialsListMenu(current, pages, type, limit, serials) {
	var keys = [], r1 = [], r2 = [];
	if (pages > 1) {
  		var p1 = `serials_0_`;
		var p3 = `_${type}_${current}`;
		if (current > 2) 
  			r1.push({ text: `${emoji.ar1} 1`, callback_data: p1+1+p3 });
		if (current > 1) 
  			r1.push({ text: `${emoji.ar3} ${current-1}`, callback_data: p1+(current-1)+p3 });
 		r1.push({ text: `<${current}>`, callback_data: p1+current+p3 });
 		if (current < pages) 
  			r1.push({ text: `${current+1} ${emoji.ar4}`, callback_data: p1+(current+1)+p3 });
 		if (current < pages-1) 
  			r1.push({ text: `${pages} ${emoji.ar6}`, callback_data: p1+pages+p3 });
		keys.push(r1);
	}	
	var n = 0;
	var skip = limit*(current-1);
	var r = Math.ceil(Math.sqrt(serials.length));
	if (r > 5) r = 5;
	for (var i = 0; i < Math.ceil(serials.length / r); i++) {
		var r2 = [];
		for (var j = 0; j < r; j++) {
			r2.push ({ text: n+1, callback_data: 'serials_1_'+serials[n].serialId });		
			n++;
			if (n >= serials.length)
				break;
		}
		keys.push(r2);
		if (n >= serials.length)
			break;
	}
	keys.push([{ text: 'Профиль', callback_data: 'toprofile' }]);
	return {
    	reply_markup: JSON.stringify({
    		inline_keyboard: keys
    	})
	};
}
//инлайн кнопки для перехода по найденным сериалам
function getFindSerialsMenu(serials) {
	var keys = [];
	if (serials.length != 0) {
		var n = 0;
		var r = Math.ceil(Math.sqrt(serials.length));
		if (r > 5) r = 5;

  		for (var i = 0; i < Math.ceil(serials.length / r); i++) {
  			var r1 = [];
  			for (var j = 0; j < r; j++) {
				r1.push( { text: `${n+1}`, callback_data: 'toserial_'+serials[n].id+'_0' } );
				n++;
				if (n >= serials.length)
					break;
			}
			keys.push(r1);
			if (n >= serials.length)
				break;
  		}
	}
	keys.push([ {text: 'Профиль', callback_data: 'toprofile' }] );
	return {
    	reply_markup: JSON.stringify({
    		inline_keyboard: keys
    	})
	};
}

//инлайн кнопки для управления сериалом и сезоны
async function getSerialMenu(id, serialId) {
	var keys = [];
	var r1 = [];

	var serial = await db.collection("UserSerials").findOne({ userId: id, serialId: +serialId });
	var status = -1;
	if (serial)
		status = serial.status;

	var st = 'serial_status_'+serialId+'_';
	if (status != 0)
		r1.push( {text: 'Смотрю', callback_data: st+0 } );
	if (status != 1)
		r1.push( {text: 'Буду смотреть', callback_data: st+1 } );
	if (status != 2)
		r1.push( {text: 'Заброшен', callback_data: st+2 } );
	if (status != 3)
		r1.push( {text: 'Просмотрен', callback_data: st+3 } );

	keys.push(r1);
	var rating = [];
	for (var i = 0; i < 5; i++){
		var t = emojirating[i];
		if (serial && serial.rating == i+1)
			t = t+emoji.checkmark;
		rating.push( {text: t, callback_data: `serial_rating_${serialId}_${i+1}` } );
	}
	keys.push(rating);


	keys.push([ {text: 'Сезоны', callback_data: 'seasons_'+serialId }] );
	keys.push([ {text: 'Профиль', callback_data: 'toprofile' }] );

	return {
    	reply_markup: JSON.stringify({
      		inline_keyboard: keys
    	})
  	};
}

//инлайн кнопки для выбора сезона
async function getSeasonsMenu(serialId) { 
	var keys = [];
	var serial = await getSerialData(serialId, false);
	var n = 1;
	var r = Math.ceil(Math.sqrt(serial.totalSeasons));
	if (r > 5) r = 5;
	for (var i = 0; i < Math.ceil(serial.totalSeasons / r); i++) {
		var r1 = [];
		for (var j = 0; j < r; j++) {
			r1.push( { text: `${n}`, callback_data: `series_${serialId}_${n}_1_0` } ); //-- series_serialId_season_topage_current
			n++;
			if (n > serial.totalSeasons)
				break;
		}
		keys.push(r1);
		if (n > serial.totalSeasons)
			break;
	}
	keys.push( [ {text: 'Назад', callback_data: 'toserial_'+serialId+'_1' } ]);

	return {
    	reply_markup: JSON.stringify({
      		inline_keyboard:  keys 
    	})
  	};
}

//инлайн кнопки для управления сериями
async function getSeriesMenu(id, current, pages, episodes, serialId, season) {
	var keys = [];
	if (episodes.length != 0) {
		if (pages > 1) {
			var rkeys = [];
  			var p1 = `series_${serialId}_${season}_`; //-- series_serialId_season_topage_current
			var p3 = `_${current}`;
			if (current > 2) 
  				rkeys.push({ text: `${emoji.ar1} 1`, callback_data: p1+1+p3 });
			if (current > 1) 
  				rkeys.push({ text: `${emoji.ar3} ${current-1}`, callback_data: p1+(current-1)+p3 });
 			rkeys.push({ text: `<${current}>`, callback_data: p1+current+p3 });
 			if (current < pages) 
  				rkeys.push({ text: `${current+1} ${emoji.ar4}`, callback_data: p1+(current+1)+p3 });
 			if (current < pages-1) 
  				rkeys.push({ text: `${pages} ${emoji.ar6}`, callback_data: p1+pages+p3 });
			keys.push(rkeys);
		}
		var s = `series_${serialId}_${season}_${current}_${current}_`;

		var count = await db.collection("UserSeries").countDocuments({ userId: id, serialId: +serialId, season: +season });
		if (count != episodes.length)
			keys.push( [ { text: `${emoji.check}Выбрать все`, callback_data: s+'0_1' } ]);
		if (count != 0)
			keys.push( [ { text: `${emoji.uncheck}Очистить все`, callback_data: s+'0_0' } ]);

			var n = 0, sp = 1, nsp = 1;
			var r = Math.ceil(Math.sqrt(episodes.length));
			if (r > 5) r = 5;

			for (var i = 0; i < Math.ceil(episodes.length / r); i++) {
				var r1 = [];
				for (var j = 0; j < r; j++) {
					var watched = '0';
					var check = emoji.uncheck;
					var serie = await db.collection("UserSeries").findOne({ userId: id, serialId: +serialId, season: +season, episodeId: episodes[n].id });
					if (serie) { 
						check = emoji.check;
						watched = '1';
					}
					var number = '';
					if (episodes[n].episodeNumber == 0) {
						number = 'sp'+sp;
						sp++;
					}
					else {
						number = nsp;
						nsp++;
					}
					var w = '0'
					if (watched == '0')
						w = '1';
					r1.push( { text: `${check}${number}`, callback_data: s+`1_${episodes[n].id}_${w}` } );
					n++;
					if (n >= episodes.length)
						break;
				}
				keys.push(r1);
				if (n >= episodes.length)
						break;
			}
	}
	
	keys.push( [ {text: 'Назад', callback_data: 'toseasons_'+serialId+'_'+season } ] );

	return {
    	reply_markup: JSON.stringify({
      		inline_keyboard: keys
    	})
  	};
}

async function showProfile(bot, msg, user, edit) {
	var userserials = await db.collection("UserSerials").find({ userId: user.userId }).toArray();
	var s1 = 0, s2 = 0, s3 = 0, s4 = 0;
	var ser1 = '', ser2 = '', f = '';
	if (userserials.length != 0)
	{
		for (var i = 0; i < userserials.length; i++)
		{
			if (userserials[i].status == 0)
				s1++;
			if (userserials[i].status == 1)
				s2++;
			if (userserials[i].status == 2)
				s3++;
			if (userserials[i].status == 3)
				s4++;
		}
		var count = await db.collection("UserSeries").countDocuments({ userId: user.userId });
		if (count != 0)
			ser1 = 'Просмотрено серий: '+count;
		ser2 = '\nСписок моих сериалов:';
	}
	else f = `\n${texth.find}\n`;
	var date =`С нами с ${user.regdate}.`;

	var sendmsg = `${ser1}\n${date}\n${f}\n/settings - настройки\n${ser2}`;
	if (s1 > 0 || s2 > 0 || s3 > 0 || s4 > 0) {
		if (edit == 0) {
			var options = Object.assign({}, getProfileMenu(s1, s2, s3, s4), { chat_id: msg.from.id, message_id: msg.message_id});	
			bot.sendMessage(user.userId, sendmsg, options);
		}
		else {
			var options = Object.assign({}, getProfileMenu(s1, s2, s3, s4), { chat_id: msg.message.chat.id, message_id: msg.message.message_id});	
			bot.editMessageText(sendmsg, options);
		}
	}
	else { 
		bot.sendMessage(user.userId, sendmsg);
	}
}

async function showSerials(bot, msg, id, type, current, limit, skip) {
	var userserials = await db.collection("UserSerials").find({ userId: id, status: +type }).limit(limit).skip(skip).toArray();
	if (userserials.length != 0) {
		var count = await db.collection("UserSerials").countDocuments({ userId: id, status: +type });
		var pages = Math.ceil(count / limit);
		var opt = Object.assign({}, getSerialsListMenu(current, pages, type, limit, userserials), { chat_id: msg.message.chat.id, message_id: msg.message.message_id, parse_mode: 'Markdown' });
		bot.editMessageText(getSerialsListText(userserials, ((current-1)*limit)+1, type), opt);
	}
	else bot.sendMessage(id, hi[2]);
}

//вывести данные сериала
async function showSerial(bot, msg, id, serialId, edit) {
	var text = await getSerialText(id, serialId);
	try {
		var opt = Object.assign({}, await getSerialMenu(id, serialId), { chat_id: msg.message.chat.id, message_id: msg.message.message_id, parse_mode: 'Markdown'});
		if (edit == '1')
			bot.editMessageText(text, opt);
		else bot.sendMessage(id, text, opt);
	}
	catch (e){
  		showError('Failed showSerial.'+e, id);
	}
}
//вывести сезоны
async function showSeasons(bot, msg, id, serialId) {
	var serial = await getSerialData(serialId, false);
	var t = 'Нет сезонов';
	if (serial.totalSeasons != 0)
		t = 'Сезоны:\n';
  	var text = `${serial.title} (${serial.year})\n${t}`;
	var options = Object.assign({}, await getSeasonsMenu(serialId), { chat_id: msg.message.chat.id, message_id: msg.message.message_id });	
	bot.editMessageText(text, options);
}
//вывести серии
async function showSeries(bot, msg, id, serialId, season, current, limit, skip) {
	var serial = await getSerialData(serialId, true);
	var t = 'Нет серий';
	var episodes = [];
	var n = 0, j = 0;
	for (var i = serial.episodes.length - 1; i >= 0; i--) {
		if (serial.episodes[i].seasonNumber == (+season)) {
			n++;
			if (n <= skip+limit && n > skip) {
				episodes.push( { id: serial.episodes[i].id, episodeNumber: serial.episodes[i].episodeNumber, seasonNumber: serial.episodes[i].seasonNumber } );
				j++;
			}
		}
	}
	if (episodes.length != 0) {
		t = 'Серии:\n';
	}
	var text = `${serial.title} (${serial.year})\n${season} сезон\n${t}`;
	var pages = Math.ceil(n / limit);
	var options = Object.assign({}, await getSeriesMenu(id, current, pages, episodes, serialId, season), { chat_id: msg.message.chat.id, message_id: msg.message.message_id });
	bot.editMessageText(text, options);
}

//вывести результаты поиска
async function showFindSerials(bot, msg, id, serials) {
	if (!serials) {
		bot.sendMessage(id, 'Сейчас бот не может искать сериалы.');
		return;
	}
	var text = getFindSerialsListText(serials);
	var options = Object.assign({}, getFindSerialsMenu(serials), { chat_id: msg.chat.id, message_id: msg.message_id, parse_mode: 'Markdown'});
	bot.sendMessage(id, text, options);
}

async function checkAllSeries(msg, id, serialId, season, watched, all) {
	await checkUserSerial(id, serialId);
	var user = await db.collection("Users").findOne({ userId: id });
	var serial = await getSerialData(serialId, true);
	if (watched == '1') {
		for (var i = 0; i < serial.episodes.length; i++)
		{
			if (all == 1 || (all != 1 && serial.episodes[i].seasonNumber == (+season))) {
				var serie =  await db.collection("UserSeries").findOne({ userId: id, serialId: +serialId, episodeId: serial.episodes[i].Id });
				if (!serie) {
					db.collection("UserSeries").insertOne( { userId: id, serialId: +serialId, season: serial.episodes[i].seasonNumber, episodeId: serial.episodes[i].id } );
				}
			}
		}
	}
	if (watched == '0') {
		var opt = { userId: id, serialId: +serialId, season: +season };
		if (all == 1)
			opt = { userId: id, serialId: +serialId };
		await db.collection("UserSeries").deleteMany(opt);

		var us = await db.collection("UserSerials").findOne({ userId: id, serialId: +serialId });
		if (us.status === 3)
			await db.collection("UserSerials").updateOne({ userId: id, serialId: +serialId }, { $set: { status: 0 }});
	}
}

async function checkEpisode(msg, id, serialId, season, episode, watched) {
	await checkUserSerial(id, serialId);
	var userserie = await db.collection("UserSeries").findOne({ userId: id, serialId: +serialId, episodeId: +episode });
	var user = await db.collection("Users").findOne({ userId: id });
	if (userserie)
	{
		if (watched == '0') {
			db.collection("UserSeries").deleteOne({ userId: id, serialId: +serialId, season: +season, episodeId: +episode });
			var us = await db.collection("UserSerials").findOne({ userId: id, serialId: +serialId });
			if (us.status === 3)
				await db.collection("UserSerials").updateOne({ userId: id, serialId: +serialId }, { $set: { status: 0 }});
		}
	}
	else {
		if (watched == '1') {
			db.collection("UserSeries").insertOne({ userId: id, serialId: +serialId, season: +season, episodeId: +episode });
		}
	}
}

//получение данных сериала
async function getSerialData(serialId, withepisodes){
	try {
		var url = 'https://api.myshows.me/v2/rpc/';
		var res = await axios.post(url, {
			jsonrpc: '2.0',
        	method: 'shows.GetById',
       		params: {
       			showId: serialId,
        		withEpisodes: withepisodes
        	},
      		id: 1
		});
		var data = res.data.result;
		return data;
  	}
  	catch (e){
		showError('Failed getSerialData. '+e);
  		return null;
  	}
}

//поиск сериала
async function findSerialData(find){
  	try {
  		var f = find.replace(' ', '+');
  		f = encodeURI(find);
		var url = 'https://api.myshows.me/shows/search/?q='+f;
		var res = await axios.post(url);
		if (res.data.error)
			return [];
		var serials = [];
			for (var s in res.data) {
				serials.push(res.data[s]);
			}
		return serials;
	}
	catch (e){
		showError('Failed findSerialData. '+e);
		return null;
	}
}

async function getGenres() {
	try {
		var url = 'https://api.myshows.me/v2/rpc/';
		var res = await axios.post(url, {
			jsonrpc: '2.0',
        	method: 'shows.Genres',
       		params: { },
      		id: 1
		});
		var data = res.data.result;
		return data;
  	}
  	catch (e){
  		showError('Failed getGenres. '+e);
  	}
}
function showError(e, id){
	
	var error = getDate()+' Error: ';
	if (id)
		error += 'id: '+id;
	console.log(error+' - '+e);
}
function showSmth(text, id){
	var t = getDate()+' ';
	if (id)
		t += 'id: '+id;
	console.log(t+' - '+text);
}
function getDate(){
	var now = new Date();
	return now.toLocaleString().replace(/T/, ' ').replace(/\../, '');
}