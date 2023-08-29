type LatLng = {lat: number|null, lng: number|null};

type GEF_Round = {
	location: LatLng,
	player_guess: LatLng,
	distance: {
		meters: {
			amount: number,
			unit: string,
		},
		miles: {
			amount: number,
			unit: string,
		}
	},
	score: {
		amount: number,
		unit: string,
		percentage: number
	}
};
	
type GEF_State = {
	current_game_id: string,
	is_challenge_link: boolean,
	current_round: number,
	round_in_progress: boolean,
	game_in_progress: boolean,
	total_distance: {
		meters: {
			amount: number,
			unit: string,
		},
		miles: {
			amount: number,
			unit: string,
		}
	},
	total_score: {
		amount: number,
		unit: string,
		percentage: number
	},
	rounds: Array<GEF_Round>,
	map: {
		id: string,
		name: string,
	},
}

var GeoGuessrEventFramework;

(function() {
	let gApiData;
	const default_fetch = window.fetch;
	window.fetch = (function () {
			return async function (...args) {
					if(/geoguessr.com\/api\/v3\/(games|challenges)\//.test(args[0].toString())) {
						let result = await default_fetch.apply(window, args);
						gApiData = await result.clone().json();
						return result;
					}

					return default_fetch.apply(window, args);
			};
	})();

	function getGAPIData(state: GEF_State): any {
		if(gApiData && gApiData.token === state.current_game_id && gApiData.round === state.current_round) {
			return gApiData;
		}

		return null;
	}
	
	class GEF {
		public events = new EventTarget();
		public loadedPromise: Promise<this>;

		private state: GEF_State = this.defaultState();
	
		constructor() {
			this.init();
			this.loadState();
		
			let el = document.querySelector('#__next');
			if(!el) return;
			
			const observer = new MutationObserver(this.checkState.bind(this));
			observer.observe(el, { subtree: true, childList: true });
		}

		public async init(): Promise<this> {
			if(!this.loadedPromise) {
				this.loadedPromise = Promise.resolve(this);
			}

			return this.loadedPromise;
		}
	
		private defaultState(): GEF_State {
			return {
				current_game_id: '',
				is_challenge_link: false,
				current_round: 0,
				round_in_progress: false,
				game_in_progress: true,
				total_score: {amount: 0, unit: 'points', percentage: 0},
				total_distance: {
					meters: {amount: 0, unit: 'km'},
					miles: {amount: 0, unit: 'miles'}
				},
				rounds: [],
				map: {id: '', name: ''},
			}
		}
	
		private loadState(): void {
			let data = window.localStorage.getItem('GeoGuessrEventFramework_STATE');
			if(!data) return;
			
			let dataJson: GEF_State = JSON.parse(data);
			if(!data) return;
		
			dataJson.current_round = 0;
			dataJson.round_in_progress = false;
			dataJson.game_in_progress = true;
		
			Object.assign(this.state, this.defaultState(), dataJson);
			this.saveState();
		}
	
		private saveState(): void {
			window.localStorage.setItem('GeoGuessrEventFramework_STATE', JSON.stringify(this.state));
		}
		
		private getCurrentRound(): number {
			const roundNode = document.querySelector('div[class^="status_inner__"]>div[data-qa="round-number"]');
			const text = roundNode?.children[1].textContent;
			if(!text) return 0;
	
			return parseInt(text.split(/\//gi)[0].trim());
		}
	
		private getGameMode(): string|undefined {
			if(location.pathname.startsWith("/game/")) return 'game';
			if(location.pathname.startsWith("/challenge/")) return 'challenge';
			return undefined;
		}
	
		private getGameId(): string {
			return window.location.href.substring(window.location.href.lastIndexOf('/') + 1);
		}
	
		private async startRound(): Promise<void> {
			if(!this.getGameMode()) return;

			// if game ID has changed just reset the state
			if(this.state.current_game_id !== this.getGameId()) {
				this.state = this.defaultState();
			}
	
			this.state.current_round = this.getCurrentRound();
			this.state.round_in_progress = true;
			this.state.game_in_progress = true;
			this.state.current_game_id = this.getGameId();
			this.state.is_challenge_link = this.getGameMode() == 'challenge';

			let gData = getGAPIData(this.state);

			if(gData) {
				this.state.map = {
					id: gData.map,
					name: gData.mapName
				}
			}

			this.saveState();

			console.log('round_start')
			console.log(this.state)
	
			if(this.state.current_round === 1) {
				this.events.dispatchEvent(new CustomEvent('game_start', {detail: this.state}));
			}
	
			this.events.dispatchEvent(new CustomEvent('round_start', {detail: this.state}));
		}
	
		private async stopRound(): Promise<void> {
			this.state.round_in_progress = false;

			let gData = getGAPIData(this.state);

			if(gData) {
				const r = gData.rounds[this.state.current_round-1];
				const g = gData.player.guesses[this.state.current_round-1];

				this.state.rounds[this.state.current_round - 1] = {
					location: {lat: r.lat, lng: r.lng},
					player_guess: {lat: g.lat, lng: g.lng},
					score: {
						amount: parseFloat(g.roundScore.amount),
						unit: g.roundScore.unit,
						percentage: g.roundScore.percentage,
					},
					distance: {
						meters: {
							amount: parseFloat(g.distance.meters.amount),
							unit: g.distance.meters.unit,
						},
						miles: {
							amount: parseFloat(g.distance.miles.amount),
							unit: g.distance.miles.unit,
						},
					}
				}

				this.state.total_score = {
					amount: parseFloat(gData.player.totalScore.amount),
					unit: gData.player.totalScore.unit,
					percentage: gData.player.totalScore.percentage,
				}

				this.state.total_distance = {
					meters: {
						amount: parseFloat(gData.player.totalDistance.meters.amount),
						unit: gData.player.totalDistance.meters.unit,
					},
					miles: {
						amount: parseFloat(gData.player.totalDistance.miles.amount),
						unit: gData.player.totalDistance.miles.unit,
					},
				}

				this.state.map = {
					id: gData.map,
					name: gData.mapName
				}
			}
	
			this.saveState();

			console.log('round_end')
			console.log(this.state)
	
			this.events.dispatchEvent(new CustomEvent('round_end', {detail: this.state}));
	
			if(this.state.current_round === 5) {
				this.events.dispatchEvent(new CustomEvent('game_end', {detail: this.state}));
			}
		}
	
		private checkState(): void {
			const gameLayout = document.querySelector('.game-layout');
			const resultLayout = document.querySelector('div[class^="round-result_wrapper__"]');
			const finalScoreLayout = document.querySelector('div[class^="result-layout_root__"] div[class^="result-overlay_overlayContent__"]');
		
			if(gameLayout) {
				if (this.state.current_round !== this.getCurrentRound() || this.state.current_game_id !== this.getGameId()) {
					if(this.state.round_in_progress) {
						this.stopRound();
					}
		
					this.startRound();
				}else if(resultLayout && this.state.round_in_progress) {
					this.stopRound();
				}else if(finalScoreLayout && this.state.game_in_progress) {
					this.state.game_in_progress = false;
				}
			}
		}
	}
	
	GeoGuessrEventFramework = new GEF();
	console.log('GeoGuessr Event Framework initialised: https://github.com/miraclewhips/geoguessr-event-framework');
})();